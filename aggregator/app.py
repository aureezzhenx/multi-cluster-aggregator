# aggregator/app.py
from fastapi import FastAPI, HTTPException, Query, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
import requests
import json
import os
import jwt
import datetime
from typing import Optional

app = FastAPI(title="K8s Aggregator API (Final)")

# ---- CORS ----
origins = [
    "http://localhost:8100"
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth config
SECRET_KEY = os.environ.get("AGG_SECRET", "super-secret-key-change")
ALGO = "HS256"
USERS_FILE = os.environ.get("USERS_FILE", "/app/users.json")

oauth = OAuth2PasswordBearer(tokenUrl="/login")


def load_users():
    if os.path.exists(USERS_FILE):
        with open(USERS_FILE) as f:
            return json.load(f)
    return {}


def create_token(username: str, minutes: int = 60*12):
    payload = {
        "sub": username,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(minutes=minutes)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGO)


def get_current_user(token: str = Depends(oauth)) -> str:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGO])
        return payload.get("sub")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# login supports both JSON body {username,password} and form (OAuth2PasswordRequestForm)
@app.post("/login", response_model=TokenResponse)
async def login(request: Request):
    users = load_users()
    content_type = request.headers.get("content-type", "")
    username = password = None

    if content_type.startswith("application/json"):
        body = await request.json()
        username = body.get("username")
        password = body.get("password")
    else:
        # Try form data (x-www-form-urlencoded), works with OAuth2PasswordRequestForm
        form = await request.form()
        username = form.get("username")
        password = form.get("password")

    if not username or not password:
        raise HTTPException(status_code=400, detail="username & password required")

    if username not in users or users[username] != password:
        raise HTTPException(status_code=401, detail="Incorrect username or password")

    token = create_token(username)
    # print login to stdout for visibility
    print(json.dumps({"ts": datetime.datetime.utcnow().isoformat() + "Z", "event": "login", "user": username}))
    return TokenResponse(access_token=token)


# Log model (UI forwards logs here). Require token.
class LogItem(BaseModel):
    ts: str
    level: str
    user: str
    event: Optional[dict | str]
    details: Optional[dict] = None


@app.post("/log")
def receive_log(item: LogItem, current_user: str = Depends(get_current_user)):
    # Print to stdout so container logs capture it
    out = {
        "ts": item.ts,
        "level": item.level,
        "user": item.user,
        "event": item.event,
        "details": item.details
    }
    print(json.dumps({"ts": datetime.datetime.utcnow().isoformat() + "Z", "ui_log": out}))
    return {"status": "ok"}


# ---------------- K8s aggregator core ----------------
CLUSTERS_FILE = os.environ.get("CLUSTERS_FILE", "/app/clusters.json")
with open(CLUSTERS_FILE) as f:
    clusters = json.load(f)


@app.get("/clusters", dependencies=[Depends(get_current_user)])
def list_clusters():
    return list(clusters.keys())


@app.get("/namespaces/{cluster}", dependencies=[Depends(get_current_user)])
def list_namespaces(cluster: str):
    if cluster not in clusters:
        raise HTTPException(status_code=404, detail="Cluster not found")
    try:
        url = f"{clusters[cluster]}/namespaces"
        r = requests.get(url, timeout=5)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/deployments/{cluster}/{namespace}", dependencies=[Depends(get_current_user)])
def list_deployments(cluster: str, namespace: str):
    if cluster not in clusters:
        raise HTTPException(status_code=404, detail="Cluster not found")
    try:
        url = f"{clusters[cluster]}/deployments/{namespace}"
        r = requests.get(url, timeout=5)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/restart", dependencies=[Depends(get_current_user)])
def restart_deployment(
    cluster: str = Query(...),
    namespace: str = Query(...),
    deployment_name: str = Query(...)
):
    if cluster not in clusters:
        raise HTTPException(status_code=404, detail="Cluster not found")
    try:
        url = f"{clusters[cluster]}/restart"
        r = requests.get(
            url,
            params={
                "namespace": namespace,
                "deployment_name": deployment_name
            },
            timeout=10
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
