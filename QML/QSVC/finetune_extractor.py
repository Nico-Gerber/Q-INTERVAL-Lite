"""Fine-tune ResNet18 as a feature extractor, then re-run ComBat so feature_audit.py can score it.

Split logic (why the numbers stay honest):
  - The existing cache already fixes which images are TRAIN and which are TEST. We reuse that split,
    so the test images are the same 3000 as in every earlier result and the network never sees them.
  - TRAIN is cut in two. Part A fine-tunes the network. Part B is never used for fine-tuning, so its
    embeddings are as honest as the test embeddings. ComBat and the downstream classifier train on B.
    (Training the classifier on embeddings of images the network memorised would inflate the result.)

Anti-shortcut measures:
  - Samples are drawn with weight 1 / count(source, label), so each source shows the network every
    diagnosis about equally often. The source label then carries no information about the diagnosis
    inside a batch.
  - Only layer3, layer4 and a new head train. Label smoothing, dropout and augmentation limit memorising.


runs unchanged.
"""
import os
import sys
import argparse
import time
import copy
import importlib.util

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
from torchvision import models, transforms
from PIL import Image
from sklearn.model_selection import train_test_split

THIS_DIR = os.path.dirname(os.path.abspath(__file__))


def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(THIS_DIR, filename))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


combat_module = load_module("combat_train_module", "combat_train.py")
dann_module = combat_module.dann_module

OUT_DIR = os.path.join(THIS_DIR, "finetune_outputs")
os.makedirs(OUT_DIR, exist_ok=True)

LABEL_IDS = {"normal": 0, "benign": 1, "malignant": 2}
SEED = 42
BATCH_SIZE = 32
LR_BACKBONE = 3e-5
LR_HEAD = 1e-3
WEIGHT_DECAY = 1e-3
MIN_CELL_COUNT = 40          # stops tiny (source, label) cells from being oversampled to absurdity
IMG_SIZE = 224
MEAN = torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1)
STD = torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)


# data

def load_uint8_images(filenames, cache_path):
    """Grayscale 224x224 uint8 (about 50 KB each), cached so a rerun does not touch the external drive."""
    if os.path.exists(cache_path):
        cached = np.load(cache_path, allow_pickle=True)
        if list(cached["files"]) == list(filenames):
            print(f"  reusing cached pixels from {cache_path}")
            return cached["imgs"]
    imgs = np.zeros((len(filenames), IMG_SIZE, IMG_SIZE), dtype=np.uint8)
    for i, f in enumerate(filenames):
        path = dann_module.resolve_image_path(f, dann_module.IMAGE_BASE_FOLDER)
        img = Image.open(path).convert("L").resize((IMG_SIZE, IMG_SIZE), Image.BILINEAR)
        imgs[i] = np.asarray(img)
        if (i + 1) % 500 == 0:
            print(f"    loaded {i + 1}/{len(filenames)} images...")
    np.savez(cache_path, imgs=imgs, files=np.array(filenames))
    return imgs


def to_model_input(batch_u8):
    x = batch_u8.float().div(255.0).unsqueeze(1).repeat(1, 3, 1, 1)
    return (x - MEAN) / STD


class AugmentedSet(Dataset):
    def __init__(self, imgs, labels, augment):
        self.imgs, self.labels, self.augment = imgs, labels, augment
        self.aug = transforms.RandomAffine(degrees=8, translate=(0.04, 0.04), scale=(0.92, 1.08))

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, i):
        x = torch.from_numpy(self.imgs[i]).unsqueeze(0)
        if self.augment:
            x = self.aug(x)
            if np.random.rand() < 0.5:
                x = torch.flip(x, dims=[2])
        return x.squeeze(0), int(self.labels[i])


# ---------------------------------------------------------------- model

class Net(nn.Module):

    def __init__(self, unfreeze_all=False):
        super().__init__()
        base = models.resnet18(weights=models.ResNet18_Weights.IMAGENET1K_V1)
        self.unfreeze_all = unfreeze_all
        if unfreeze_all:
            self.early = nn.Sequential(base.conv1, base.bn1, base.relu, base.maxpool, base.layer1)
            self.mid = nn.Sequential(base.layer2)
            self.stem = nn.Sequential() 
        else:
            self.early = nn.Sequential()
            self.mid = nn.Sequential()
            self.stem = nn.Sequential(base.conv1, base.bn1, base.relu, base.maxpool, base.layer1, base.layer2)
            for p in self.stem.parameters():
                p.requires_grad = False
        self.tuned = nn.Sequential(base.layer3, base.layer4)
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.head = nn.Sequential(nn.Dropout(0.3), nn.Linear(512, 3))

    def features(self, x):
        if self.unfreeze_all:
            x = self.mid(self.early(x))
        else:
            with torch.no_grad():
                x = self.stem(x)
        return self.pool(self.tuned(x)).flatten(1)

    def forward(self, x):
        return self.head(self.features(x))

    def set_train(self):
        self.train()
        if not self.unfreeze_all:
            self.stem.eval()  


@torch.no_grad()
def embed(model, imgs_u8, device, bs=64):
    model.eval()
    out = []
    for s in range(0, len(imgs_u8), bs):
        xb = to_model_input(torch.from_numpy(imgs_u8[s:s + bs])).to(device)
        out.append(model.features(xb).cpu().numpy())
    return np.concatenate(out).astype(np.float64)


@torch.no_grad()
def predict(model, imgs_u8, device, bs=64):
    model.eval()
    out = []
    for s in range(0, len(imgs_u8), bs):
        xb = to_model_input(torch.from_numpy(imgs_u8[s:s + bs])).to(device)
        out.append(model(xb).argmax(1).cpu().numpy())
    return np.concatenate(out)


def per_source_report(pred, y, src):
    accs = {}
    for s in np.unique(src):
        m = src == s
        accs[s] = float((pred[m] == y[m]).mean())
    return float((pred == y).mean()), float(np.mean(list(accs.values()))), accs


# main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cache", help="existing combat cache (.npz); only its train/test split is used")
    ap.add_argument("--n-a", type=int, default=6000, help="images used to fine-tune the network")
    ap.add_argument("--n-b", type=int, default=6000, help="held-out train images for ComBat + classifier")
    ap.add_argument("--n-test", type=int, default=None, help="limit test images (smoke test only)")
    ap.add_argument("--epochs", type=int, default=6)
    ap.add_argument("--unfreeze-all", action="store_true",
                     help="train every ResNet18 stage, with layer-wise learning rates, instead "
                          "of only layer3/layer4")
    ap.add_argument("--lr-early", type=float, default=1e-6, help="conv1/bn1/layer1, unfreeze-all only")
    ap.add_argument("--lr-mid", type=float, default=1e-5, help="layer2, unfreeze-all only")
    ap.add_argument("--out-tag", default=None,
                     help="output filename suffix, e.g. 'unfrozen' -> finetuned_unfrozen_cache.npz. "
                          "Defaults to 'unfrozen' when --unfreeze-all is set, else no suffix "
                          "(overwrites finetuned_combat_cache.npz, the current deployed baseline).")
    args = ap.parse_args()
    if args.out_tag is None:
        args.out_tag = "unfrozen" if args.unfreeze_all else None

    torch.manual_seed(SEED)
    np.random.seed(SEED)
    device = dann_module.get_device()
    print(f"Using device: {device}")

    c = np.load(args.cache, allow_pickle=True)
    f_tr, y_tr, s_tr = c["f_train"], c["y_train"], c["src_train"]
    f_te, y_te, s_te = c["f_test"], c["y_test"], c["src_test"]
    if args.n_test:
        f_te, y_te, s_te = f_te[:args.n_test], y_te[:args.n_test], s_te[:args.n_test]

    idx = np.arange(len(y_tr))
    need = args.n_a + args.n_b
    if need < len(idx):
        idx, _ = train_test_split(idx, train_size=need, stratify=y_tr, random_state=SEED)
    idx_a, idx_b = train_test_split(idx, train_size=args.n_a / need, stratify=y_tr[idx], random_state=SEED)
    print(f"A (fine-tune) {len(idx_a)}, B (ComBat + classifier) {len(idx_b)}, test {len(y_te)}")

    all_files = np.concatenate([f_tr[idx_a], f_tr[idx_b], f_te])
    tag = f"pix_{len(idx_a)}_{len(idx_b)}_{len(y_te)}.npz"
    print("Loading pixels...")
    imgs = load_uint8_images(all_files, os.path.join(OUT_DIR, tag))
    na, nb = len(idx_a), len(idx_b)
    img_a, img_b, img_te = imgs[:na], imgs[na:na + nb], imgs[na + nb:]

    ya = np.array([LABEL_IDS[v] for v in y_tr[idx_a]])
    yb = np.array([LABEL_IDS[v] for v in y_tr[idx_b]])
    yt = np.array([LABEL_IDS[v] for v in y_te])
    sa, sb = s_tr[idx_a], s_tr[idx_b]

    # weight = 1 / count(source, label): every source sees all diagnoses about equally often
    cell = pd.Series(list(zip(sa, ya)))
    counts = cell.map(cell.value_counts()).values.astype(float)
    weights = 1.0 / np.maximum(counts, MIN_CELL_COUNT)
    sampler = WeightedRandomSampler(torch.tensor(weights, dtype=torch.double), num_samples=na, replacement=True)
    loader = DataLoader(AugmentedSet(img_a, ya, True), batch_size=BATCH_SIZE, sampler=sampler, num_workers=0)

    # small monitoring slice of B: never trained on, so it shows generalisation, not memorisation
    mon = np.arange(min(1500, nb))

    model = Net(unfreeze_all=args.unfreeze_all).to(device)
    param_groups = [
        {"params": model.tuned.parameters(), "lr": LR_BACKBONE},
        {"params": model.head.parameters(), "lr": LR_HEAD},
    ]
    if args.unfreeze_all:
        param_groups += [
            {"params": model.early.parameters(), "lr": args.lr_early},
            {"params": model.mid.parameters(), "lr": args.lr_mid},
        ]
        print(f"Unfreezing all layers: early lr={args.lr_early}, mid lr={args.lr_mid}, "
              f"tuned lr={LR_BACKBONE}, head lr={LR_HEAD}")
    opt = torch.optim.AdamW(param_groups, weight_decay=WEIGHT_DECAY)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)
    loss_fn = nn.CrossEntropyLoss(label_smoothing=0.1)

    best, best_state = -1.0, None
    for ep in range(1, args.epochs + 1):
        model.set_train()
        t0, tot, n = time.time(), 0.0, 0
        for xb, yb_ in loader:
            xb = to_model_input(xb).to(device)
            yb_ = yb_.to(device)
            opt.zero_grad()
            loss = loss_fn(model(xb), yb_)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            tot += loss.item() * len(yb_)
            n += len(yb_)
        sched.step()
        pred = predict(model, img_b[mon], device)
        acc, macro, per = per_source_report(pred, yb[mon], sb[mon])
        print(f"epoch {ep}/{args.epochs}  loss={tot / n:.3f}  monitor acc={acc:.3f}  "
              f"mean per-source acc={macro:.3f}  ({time.time() - t0:.0f}s)")
        print("    per source: " + "  ".join(f"{k}={v:.2f}" for k, v in per.items()))
        if macro > best:
            best, best_state = macro, copy.deepcopy(model.state_dict())

    suffix = f"_{args.out_tag}" if args.out_tag else ""
    model.load_state_dict(best_state)
    torch.save(best_state, os.path.join(OUT_DIR, f"resnet18_finetuned{suffix}.pth"))
    print(f"\nKept the epoch with mean per-source monitor accuracy {best:.3f}")

    print("\nEmbedding B and test with the fine-tuned network...")
    Zb = embed(model, img_b, device)
    Zt = embed(model, img_te, device)

    print("\nComBat on B (fit on B only, applied to test)...")
    Zb_h, Zt_h = combat_module.run_combat(Zb, sb, np.array(y_tr[idx_b]), Zt, s_te)

    out = os.path.join(OUT_DIR, f"finetuned{suffix}_cache.npz" if suffix else "finetuned_combat_cache.npz")
    np.savez(out, Z_train_harm=Zb_h, Z_test_harm=Zt_h, Z_train_raw=Zb, Z_test_raw=Zt,
             y_train=y_tr[idx_b], y_test=y_te, f_train=f_tr[idx_b], f_test=f_te,
             src_train=sb, src_test=s_te)
    print(f"Saved {out}")
    print(f"Direct network test accuracy (its own head): {(predict(model, img_te, device) == yt).mean():.3f}")
    print(f"\nNext: python3 feature_audit.py {out}")


if __name__ == "__main__":
    main()
