from fastapi import FastAPI, HTTPException, Query
from kubernetes import client, config
from kubernetes.client.rest import ApiException
import datetime

app = FastAPI(title="K8s Agent API")

# Load K8s in-cluster config
config.load_incluster_config()
apps_v1 = client.AppsV1Api()
core_v1 = client.CoreV1Api()

@app.get("/namespaces")
def list_namespaces():
    try:
        namespaces = core_v1.list_namespace()
        return [ns.metadata.name for ns in namespaces.items]
    except ApiException as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/deployments/{namespace}")
def list_deployments(namespace: str):
    try:
        deployments = apps_v1.list_namespaced_deployment(namespace)
        return [dep.metadata.name for dep in deployments.items]
    except ApiException as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/restart")
def restart_deployment(
    namespace: str = Query(...),
    deployment_name: str = Query(...)
):
    try:
        patch_body = {
            "spec": {
                "template": {
                    "metadata": {
                        "annotations": {
                            "kubectl.kubernetes.io/restartedAt": datetime.datetime.utcnow().isoformat()
                        }
                    }
                }
            }
        }

        apps_v1.patch_namespaced_deployment(
            name=deployment_name,
            namespace=namespace,
            body=patch_body
        )

        return {
            "status": "success",
            "message": f"Deployment {deployment_name} restarted in namespace {namespace}"
        }

    except ApiException as e:
        raise HTTPException(status_code=500, detail=str(e))
