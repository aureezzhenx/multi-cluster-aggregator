# Multi-Cluster K8s Aggregator

## Deskripsi

Proyek ini adalah sistem **FastAPI Aggregator + Agent** untuk mengelola deployment di multi-cluster Kubernetes. Dengan setup ini, satu FastAPI Aggregator bisa mengontrol banyak cluster (A/B/C/D) melalui agent yang berjalan di tiap cluster.

Fitur:

* List semua cluster yang terdaftar
* List namespace di tiap cluster
* List deployment di tiap namespace
* Restart deployment di semua namespace
* Menggunakan **RBAC** (ClusterRole, ClusterRoleBinding, ServiceAccount) untuk keamanan
* Swagger UI untuk testing API

---

## Struktur Folder

```
multi-cluster-aggregator/
├── aggregator/
│   ├── app.py
│   └── clusters.json         # daftar cluster dan URL agent
│   └── users.json         # daftar users
│   └── requirements.txt       
│   └── Dockerfile  
├── agent/
│   ├── app.py
│   ├── requirements.txt
│   └── Dockerfile
├── k8s/
│   ├── agent-deployment.yaml
│   ├── agent-service.yaml
│   └── rbac/
│       ├── agent-sa.yaml
│       ├── agent-clusterrole.yaml
│       └── agent-clusterrolebinding.yaml
├── multi-cluster-ui/
│   ├── app.js
│   └── Dockerfile    
│   └── index.html         
│   └── style.css    

```

---

## Cara Deploy

### 1. Build Docker Images

```
docker build -t myregistry/k8s-agent:latest ./agent
docker push myregistry/k8s-agent:latest

docker build -t myregistry/k8s-aggregator:latest ./aggregator
docker push myregistry/k8s-aggregator:latest
```

### 2. Apply RBAC di tiap cluster target

```
kubectl apply -f k8s/rbac/agent-sa.yaml
kubectl apply -f k8s/rbac/agent-clusterrole.yaml
kubectl apply -f k8s/rbac/agent-clusterrolebinding.yaml
```

### 3. Deploy Agent di tiap cluster

```
kubectl apply -f k8s/agent-deployment.yaml
kubectl apply -f k8s/agent-service.yaml
```

> Gunakan NodePort jika ingin akses agent dari aggregator di cluster berbeda.

### 4. Deploy Aggregator (Docker)

```
docker build -t aggregator-k8s .
docker run -d -p 8000:8000 aggregator-k8s
```

### 5. Deploy Aggregator UI (Docker)

```
docker build -t aggregator-ui .
docker run -d -p 8100:80 aggregator-ui
```

### 6. Akses Swagger UI Aggregator

```
kubectl port-forward svc/k8s-aggregator 8000:8000
```

Akses di browser: `http://localhost:8000/docs`

### 7. Tambah Cluster Baru

1. Deploy agent + RBAC di cluster baru
2. Tambahkan URL agent di `aggregator/clusters.json`
3. Restart aggregator pod atau gunakan live reload (opsional)

### 8. Tambah Users Baru

1. Tambahkan user di `aggregator/users.json`

---

## API Endpoints Aggregator

* `GET /clusters` → list semua cluster
* `GET /namespaces/{cluster}` → list namespaces di cluster
* `GET /deployments/{cluster}/{namespace}` → list deployment di namespace
* `POST /restart` → restart deployment
* `POST /login` → login
* `POST /log` → check log

### Contoh Restart Deployment

Request body JSON:

```json
{
  "cluster": "cluster-a",
  "namespace": "default",
  "deployment_name": "fastapi-b"
}
```

---

## RBAC Penjelasan

* **ServiceAccount**: `agent-sa` di namespace `default`
* **ClusterRole**: memberikan akses list/get/patch deployment di semua namespace, serta list/get namespace
* **ClusterRoleBinding**: mengikat ServiceAccount ke ClusterRole

Dengan setup ini, agent bisa mengakses semua namespace di cluster dan aggregator bisa memanggil agent dari cluster lain untuk melakukan list/restart deployment.

---

## Notes

* Gunakan NodePort atau internal network supaya aggregator bisa akses agent di cluster lain.
* Pastikan `clusters.json` aggregator berisi URL agent yang bisa diakses.
* Untuk keamanan produksi, pertimbangkan HTTPS dan token authentication antar aggregator-agent.
