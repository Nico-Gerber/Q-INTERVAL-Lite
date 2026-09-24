"""COPY THIS FILE FOR A NEW FUTURE-RISK MODEL.

Only these functions are part of the integration contract:
    initialise()
    health()          # optional but recommended
    run_inference(model_input)

Do not import FastAPI here.
Do not return HTTP responses here.
"""

_loaded = False


def initialise():
    """Load weights/artifacts once.

    If your model needs no setup, leave this function exactly as-is.
    """
    global _loaded

    if _loaded:
        return

    _loaded = True


def health():
    return {
        "status": "ok" if _loaded else "model_not_loaded",
        "model_loaded": _loaded,
    }


def run_inference(model_input):
    """Required model entrypoint.

    INPUT
    -----
    model_input = {
        "patient_age": float | None,
        "exams": [
            {
                "exam_id": "exam_1",
                "exam_date": "YYYY-MM-DD",
                "views": {
                    "L-CC": bytes | None,
                    "R-CC": bytes | None,
                    "L-MLO": bytes | None,
                    "R-MLO": bytes | None,
                },
            }
        ],
    }

    RETURN
    ------
    {
        "yearly_risk": {
            "1_year": float,
            "2_year": float,
            "3_year": float,
            "4_year": float,
            "5_year": float,
        },
        "risk_level": str,
        "exams": [
            {
                "exam_id": str,
                "exam_date": "YYYY-MM-DD",
                "contribution_percent": float | None,
            }
        ],
    }

    IMPORTANT
    ---------
    Risk numbers are percentage points:
        6.25 means 6.25%
    NOT:
        0.0625
    NOT:
        "6.25%"
    """

    initialise()

    # -------------------------------------------------------
    # YOUR MODEL CODE HERE
    # -------------------------------------------------------

    raise NotImplementedError("Implement model inference here.")
