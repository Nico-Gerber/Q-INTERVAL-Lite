import contextlib
import io
import os
import runpy

import pandas as pd


PROJECT_DIR = (
    "/fred/oz508/EMBED/"
    "classical_future_risk_vihanga"
)

METADATA_CSV = (
    "/fred/oz508/EMBED/tables/"
    "EMBED_OpenData_metadata.csv"
)

VIEW_MODIFIER = (
    "0_ViewCodeSequence_0_"
    "ViewModifierCodeSequence_CodeMeaning"
)


candidate_columns = [
    "anon_dicom_path",
    "PresentationIntentType",
    "ImageType",
    "QualityControlImage",
    "SeriesDescription",
    "SeriesNumber",
    "InstanceNumber",
    "Rows",
    "Columns",
    "BreastImplantPresent",
    VIEW_MODIFIER,
    "DerivationDescription",
    "ProtocolName",
    "ImagesInAcquisition",
    "AcquisitionTime",
    "SeriesTime",
]


# Reuse the selected cohort and duplicate-slot results from
# the previous audit. Its normal output is hidden here.
with contextlib.redirect_stdout(io.StringIO()):
    previous_audit = runpy.run_path(
        os.path.join(
            PROJECT_DIR,
            "scripts",
            "audit_selected_view_slots.py",
        )
    )


selected_images = previous_audit[
    "selected_images"
].copy()

duplicate_slots = previous_audit[
    "duplicate_slots"
].copy()


# Retain only images that belong to duplicated view slots.
duplicate_keys = duplicate_slots[
    [
        "empi_anon",
        "acc_anon",
        "view_slot",
    ]
].copy()

duplicate_images = selected_images.merge(
    duplicate_keys,
    on=[
        "empi_anon",
        "acc_anon",
        "view_slot",
    ],
    how="inner",
    validate="many_to_one",
)


print("Loading duplicate-image metadata...")


# Load metadata fields that may explain why multiple images
# occupy the same examination view slot.
metadata = pd.read_csv(
    METADATA_CSV,
    usecols=candidate_columns,
    low_memory=False,
)


# Give the metadata path a unique name before merging.
# This prevents pandas from creating _x and _y suffixes.
metadata = metadata.rename(
    columns={
        "anon_dicom_path": "metadata_dicom_path",
    }
)

metadata = metadata.drop_duplicates(
    subset=["metadata_dicom_path"],
    keep="first",
)


duplicate_images = duplicate_images.merge(
    metadata,
    left_on="original_dcm_path",
    right_on="metadata_dicom_path",
    how="left",
    validate="many_to_one",
)


group_columns = [
    "empi_anon",
    "acc_anon",
    "view_slot",
]


audit_fields = [
    "PresentationIntentType",
    "ImageType",
    "QualityControlImage",
    "SeriesDescription",
    "SeriesNumber",
    "InstanceNumber",
    "Rows",
    "Columns",
    "BreastImplantPresent",
    VIEW_MODIFIER,
    "DerivationDescription",
    "ProtocolName",
    "ImagesInAcquisition",
]


print("\nDUPLICATE METADATA LINKAGE")
print("=" * 76)

print(
    "Duplicate view slots:",
    len(duplicate_slots),
)

print(
    "Images inside duplicate slots:",
    len(duplicate_images),
)

print(
    "Rows without linked metadata:",
    int(
        duplicate_images[
            "metadata_dicom_path"
        ].isna().sum()
    ),
)


print("\nFIELDS THAT DIFFER WITHIN DUPLICATED SLOTS")
print("=" * 76)


for field in audit_fields:
    unique_values_per_slot = (
        duplicate_images.groupby(
            group_columns
        )[field]
        .nunique(dropna=False)
    )

    differing_slots = (
        unique_values_per_slot > 1
    ).sum()

    print(
        f"{field}: "
        f"{int(differing_slots)} slots differ"
    )


categorical_fields = [
    "PresentationIntentType",
    "ImageType",
    "QualityControlImage",
    "SeriesDescription",
    "BreastImplantPresent",
    VIEW_MODIFIER,
    "DerivationDescription",
    "ProtocolName",
]


print("\nMOST COMMON VALUES AMONG DUPLICATE IMAGES")
print("=" * 76)


for field in categorical_fields:
    print(f"\n{field}")
    print("-" * 76)

    values = (
        duplicate_images[field]
        .fillna("<MISSING>")
        .astype(str)
        .str.strip()
        .replace("", "<EMPTY>")
        .value_counts(dropna=False)
        .head(15)
    )

    print(values.to_string())


print("\nSAMPLE DUPLICATED VIEW RECORDS")
print("=" * 76)


sample_columns = [
    "empi_anon",
    "acc_anon",
    "view_slot",
    "filename",
    "PresentationIntentType",
    "ImageType",
    "QualityControlImage",
    "SeriesNumber",
    "InstanceNumber",
    "Rows",
    "Columns",
    VIEW_MODIFIER,
]


# Select ten of the largest duplicated view slots.
sample_keys = (
    duplicate_slots.sort_values(
        "images_in_slot",
        ascending=False,
    )
    .head(10)[group_columns]
)


sample = duplicate_images.merge(
    sample_keys,
    on=group_columns,
    how="inner",
)


sample = sample.sort_values(
    group_columns
    + [
        "SeriesNumber",
        "InstanceNumber",
        "filename",
    ],
    na_position="last",
)


print(
    sample[sample_columns]
    .to_string(index=False)
)


print("\nAUDIT NOTES")
print("=" * 76)

print("No source file was modified.")
print("No image-selection rule was applied.")
print("No training manifest was created.")
