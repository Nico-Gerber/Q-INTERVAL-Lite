"""List the Python modules a model checkpoint needs in order to be loaded, WITHOUT loading it.

Why: torch.load() unpickles the file, which imports every class stored inside it (for example OmegaConf config
objects), even if no code in this repo imports them. A missing library then only shows up as a 500 error on the
live site. Run this on a new or updated model file BEFORE uploading it, and add anything marked MISSING to
backend/requirements.txt.

Usage (from the backend folder, with the venv active):
    python scripts/list_checkpoint_dependencies.py path/to/model.pt [more files...]

It only reads the pickle instructions; it never executes the file, so it is safe to run on any checkpoint.
"""
import importlib.util
import pickletools
import sys
import tarfile
import zipfile

STRING_OPS = {"SHORT_BINUNICODE", "BINUNICODE", "BINUNICODE8", "UNICODE", "SHORT_BINSTRING", "BINSTRING", "STRING"}
GET_OPS = {"BINGET", "LONG_BINGET", "GET"}
PUT_OPS = {"BINPUT", "LONG_BINPUT", "PUT"}


def pickle_streams(path):
    """Yield the raw bytes of every pickle inside a checkpoint (torch zip, tar, or a plain pickle)."""
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as z:
            for name in z.namelist():
                if name.endswith(".pkl"):
                    yield z.read(name)
    elif tarfile.is_tarfile(path):
        with tarfile.open(path) as t:
            for member in t.getmembers():
                if member.isfile() and member.name.endswith((".pkl", ".pickle")):
                    yield t.extractfile(member).read()
    else:
        with open(path, "rb") as f:
            yield f.read()


def referenced_modules(data):
    modules, memo, strings = set(), {}, []
    for op, arg, _ in pickletools.genops(data):
        if op.name in STRING_OPS:
            strings.append(arg)
        elif op.name in GET_OPS and arg in memo:
            strings.append(memo[arg])
        elif op.name == "MEMOIZE" and strings:
            memo[len(memo)] = strings[-1]
        elif op.name in PUT_OPS and strings:
            memo[arg] = strings[-1]
        elif op.name in ("GLOBAL", "INST"):
            modules.add(str(arg).split()[0])
        elif op.name == "STACK_GLOBAL" and len(strings) >= 2:
            modules.add(strings[-2])
    return modules


def main(paths):
    exit_code = 0
    for path in paths:
        print(f"\n{path}")
        modules = set()
        try:
            for data in pickle_streams(path):
                modules |= referenced_modules(data)
        except Exception as exc:
            print(f"  could not read: {type(exc).__name__}: {exc}")
            exit_code = 1
            continue
        top_levels = sorted({m.split(".")[0] for m in modules if m and not m.startswith("_")})
        for top in top_levels:
            if top in sys.stdlib_module_names:
                continue
            found = importlib.util.find_spec(top) is not None
            print(f"  {'ok     ' if found else 'MISSING'} {top}")
            if not found:
                exit_code = 1
    print("\nAdd every MISSING module (as its pip package name) to backend/requirements.txt." if exit_code else "\nAll referenced modules are installed.")
    return exit_code


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1:]))
