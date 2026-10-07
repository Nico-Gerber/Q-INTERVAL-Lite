import contextlib
import io
import os
import runpy


PROJECT_DIR = "/fred/oz508/EMBED/classical_future_risk_vihanga"
IMAGE_DIR = "/fred/oz508/EMBED/clean_output/images"


# Reuse the exact cohort logic from the completed follow-up audit.
# Its normal printed output is hidden here.
captured_output = io.StringIO()

with contextlib.redirect_stdout(captured_output):
    audit = runpy.run_path(
        os.path.join(
            PROJECT_DIR,
            "scripts",
            "audit_followup_censoring.py",
        )
    )


eligible_images = audit["eligible"].copy()
eligible_exams = audit["eligible_exams"].copy()
one_anchor = audit["one_anchor"].copy()

ambiguous_patients = audit[
    "ambiguous_pathology_patients"
]


# Exclude patients with severity 2 or 3 pathology but no
# confirmed severity 0 or 1 cancer.
one_anchor = one_anchor[
    ~one_anchor["empi_anon"].isin(ambiguous_patients)
].copy()

anchors = one_anchor[
    ["empi_anon", "acc_anon", "exam_date"]
].rename(
    columns={
        "acc_anon": "anchor_acc_anon",
        "exam_date": "anchor_date",
    }
)


# Find all eligible examinations up to each patient's anchor.
selected_exams = eligible_exams.merge(
    anchors,
    on="empi_anon",
    how="inner",
    validate="many_to_one",
)

selected_exams = selected_exams[
    selected_exams["exam_date"]
    <= selected_exams["anchor_date"]
].copy()


# Retain the latest five examinations, including the anchor.
selected_exams = (
    selected_exams.sort_values(
        ["empi_anon", "exam_date", "acc_anon"]
    )
    .groupby("empi_anon", group_keys=False)
    .tail(5)
    .copy()
)

selected_exams["sequence_position"] = (
    selected_exams.sort_values(
        ["empi_anon", "exam_date", "acc_anon"]
    )
    .groupby("empi_anon")
    .cumcount()
    + 1
)


# Obtain all eligible images belonging to the selected exams.
selected_images = eligible_images.merge(
    selected_exams[
        [
            "empi_anon",
            "acc_anon",
            "sequence_position",
            "anchor_date",
        ]
    ],
    on=["empi_anon", "acc_anon"],
    how="inner",
    validate="many_to_one",
)

selected_images["image_path"] = selected_images[
    "filename"
].map(
    lambda name: os.path.join(IMAGE_DIR, str(name))
)

selected_images["file_exists"] = selected_images[
    "image_path"
].map(os.path.isfile)


# Count images occupying each examination view slot.
slot_counts = (
    selected_images.groupby(
        ["empi_anon", "acc_anon", "view_slot"]
    )
    .size()
    .rename("images_in_slot")
    .reset_index()
)

duplicate_slots = slot_counts[
    slot_counts["images_in_slot"] > 1
].copy()

exam_view_counts = (
    slot_counts.groupby(
        ["empi_anon", "acc_anon"]
    )["view_slot"]
    .nunique()
)


print("SELECTED COHORT")
print("=" * 72)
print("Selected patients:", one_anchor["empi_anon"].nunique())
print("Selected anchors:", len(one_anchor))
print("Selected examinations:", len(selected_exams))
print("Selected images:", len(selected_images))

print("\nSEQUENCE LENGTHS")
print("=" * 72)
print(
    selected_exams.groupby("empi_anon")
    .size()
    .value_counts()
    .sort_index()
)

print("\nAVAILABLE VIEW SLOTS PER EXAMINATION")
print("=" * 72)
print(
    exam_view_counts.value_counts()
    .sort_index()
)

print("\nDUPLICATE VIEW SLOTS")
print("=" * 72)
print("Total view slots:", len(slot_counts))
print("Duplicate view slots:", len(duplicate_slots))
print(
    "Examinations containing a duplicate slot:",
    duplicate_slots[
        ["empi_anon", "acc_anon"]
    ].drop_duplicates().shape[0],
)

if len(duplicate_slots) > 0:
    print("\nImages per duplicated slot:")
    print(
        duplicate_slots["images_in_slot"]
        .value_counts()
        .sort_index()
    )

    print("\nLargest duplicate slots:")
    print(
        duplicate_slots.sort_values(
            "images_in_slot",
            ascending=False,
        ).head(20).to_string(index=False)
    )

print("\nIMAGE FILE CHECK")
print("=" * 72)
print("Existing image files:", int(selected_images["file_exists"].sum()))
print("Missing image files:", int((~selected_images["file_exists"]).sum()))

if (~selected_images["file_exists"]).any():
    print("\nFirst missing files:")
    print(
        selected_images.loc[
            ~selected_images["file_exists"],
            ["filename", "image_path"],
        ].head(20).to_string(index=False)
    )

print("\nAUDIT NOTES")
print("=" * 72)
print("No source files were modified.")
print("No training manifest was created.")
print("No duplicate image was removed.")
print("This audit only checks the proposed final cohort.")
