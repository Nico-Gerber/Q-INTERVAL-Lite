from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import images, QMLPredict, CNNPredict, MammoRisk

app = FastAPI(title="Q-Interval Lite API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(images.router)

app.include_router(QMLPredict.router)

app.include_router(CNNPredict.router)

app.include_router(MammoRisk.router)



@app.get("/health")
def health():
    return {"status": "ok"}
