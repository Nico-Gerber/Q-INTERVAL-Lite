# Guarded VLM Explanation Workflow

This directory preserves the Sprint 06 research workflow used to convert
Mammo-CLIP V2D predictions and attention signals into reviewed natural-language
explanations.

## Purpose

The VLM does not generate breast-cancer risk predictions. The frozen V2D model
produces all hazards, cumulative risks, examination-prefix predictions,
spatial attention, and view-attention weights. The VLM receives a restricted
representation of those outputs and produces a research explanation of model
behaviour.

## Workflow

1. Select predefined validation cases without using test data.
2. Load the frozen validation-selected V2D checkpoint.
3. extract spatial and view attention;
4. calculate examination-prefix risk predictions;
5. generate attention and risk figures;
6. construct label-blind, grounded VLM inputs;
7. run Qwen2.5-VL-3B-Instruct with deterministic generation;
8. apply guarded output constraints; and
9. finalise outputs through a separate human-review step.

## Guardrails

The final workflow:

- separates examination-prefix changes from 1-to-5-year risk horizons;
- treats attention as associative rather than causal evidence;
- prevents diagnostic or pathology claims;
- limits unsupported visual interpretation;
- states that outputs are research explanations;
- requires human review before an explanation is accepted; and
- does not use outcome labels in the VLM prompt.

## Files

- `extract_v2d_explanations.py`: extracts model predictions and attention.
- `generate_v2d_attention_figures.py`: creates attention and risk figures.
- `run_grounded_vlm_explanations.py`: initial grounded generation workflow.
- `run_guarded_vlm_explanations.py`: final constrained generation workflow.
- `finalize_reviewed_vlm_outputs.py`: creates the reviewed output set.
- `slurm/`: OzSTAR VLM-generation jobs.
- `configs/`: integrity record for the final workflow.

## Excluded artifacts

Patient-level VLM input JSON files, generated explanations, reviewed outputs,
attention images, mammograms, model checkpoints, downloaded Qwen weights,
virtual environments, and credentials are excluded from Git.

The VLM workflow is not part of the standard future-risk `run.py` contract.
Any frontend explanation service should expose it through a separate,
access-controlled endpoint.