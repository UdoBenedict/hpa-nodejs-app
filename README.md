# Scalable Multi-Tier Application on Kubernetes
This project is a practical guide for building a strong Kubernetes setup by dividing it into three clear layers: routing traffic, running the application, and storing data. This structure keeps responsibilities separate and shows how Kubernetes manages both stateless apps, like a Node.js API that can be quickly scaled up or down to handle demand, and stateful apps, like MongoDB, which need fixed identities and permanent storage to keep data safe.

## Tech Stack
The project is built using a modern, lightweight, and highly performant ecosystem:

`Docker` - `Kubernetes` - `NodeJs` - `MongoDB` - `K8s Envoy Gateway API`

## What does this project do?
**Key Capabilities**
- Automated Horizontal Scaling: The application logic tier features an integrated Horizontal Pod Autoscaler (HPA). By monitoring CPU limits, the cluster automatically provisions or terminates Node.js pods (ranging from 1 to 5 replicas) to gracefully match infrastructure costs with real-time user traffic.

- Deterministic State Storage: Utilizing a Kubernetes StatefulSet with volumeClaimTemplates, the data tier ensures that every database instance receives a dedicated, non-interchangeable Persistent Volume. If a database container crashes, Kubernetes recreates it with the exact same identity, instantly re-attaching its historical data.

- Modern Declarative Routing: The project bypasses legacy Ingress controllers in favor of the Kubernetes Gateway API and Envoy Proxy. This enables cleaner separation of routing configurations (HTTPRoute) from core application services.

- Resilient Service Discovery: Internal microservices communicate seamlessly using Kubernetes native DNS routing (via a Headless Service for the stateful database layer), removing the need to hardcode ephemeral IP addresses into configuration scripts.

## Core Components
| Component | Tool/Service | Purpose |
| :--- | :---: | ---: |
| Ingress & External Routing | Envoy Gateway (Gateway & HTTPRoute) | Serves as the secure entry point into the cluster; forwards external incoming HTTP requests to inner services. |
| Business Logic Tier | Node.js Deployment | Processes incoming API endpoints, manages backend logic calculations, and interfaces with the database layer. |
| Compute Autoscaler | Horizontal Pod Autoscaler (HPA) | Constantly tracks CPU consumption against resource requests to scale application replicas seamlessly. |
| Data Persistence Tier | MongoDB StatefulSet | Manages the database workload, assigning network identities (mongo-db-0) to safeguard data alignment. |
| Storage Claim Layer | Persistent Volume Claim (PVC) | Requests and binds physical storage capacity directly from the local host system to the stateful database containers. |
| Internal Connectivity | ClusterIP & Headless Services | Facilitates abstraction layers for inner pod-to-pod networking and handles load balancing across internal compute nodes. |

## Application Stack 
| Tier | Technology | Port |
|---|---|---|
| Business Logic | Node.js + Express | 3000 |
| Database | MongoDB with PVC | 27017 |

## Deployment Guide
### Step 1: Write a dockerfile of the application. Build and push the image to Docker Hub.
```
$ docker build -t udonwaigwe/nodejs-app:v1.0 .

$ docker tag udonwaigwe/nodejs-app:v1.0 udonwaigwe/nodejs-app:v1.0

$ docker push udonwaigwe/nodejs-app:v1.0

#The push refers to repository [docker.io/udonwaigwe/nodejs-app]
```

### Step 2: Docker Login. Start Minikube. Enable Metrics-Server
The Horizontal Pod Autoscaler (HPA) works by watching the CPU and memory usage of your Pods. For it to see those numbers, your cluster needs a metrics server running. Since the local cluster is Minikube, I enable it using:

```
$ docker login -u <username>

$ start minikube

$ minikube addons enable metrics-server
```

### Step 3: Create a namespace, install Helm & Deploy Resources
Minikube doesn't come with the Gateway API out of the box. There is need to install the standard Gateway API Custom Resource Definitions (CRDs) and a controller to implement them; in this case, Envoy Gateway using Helm Chart.

This installs:
- Gateway API CRDs (e.g., GatewayClass, Gateway, HTTPRoute)
- Envoy Gateway CRDs (extensions specific to Envoy Gateway)
- Envoy Gateway controller and supporting components

```
# install Herm Chart
$ helm install eg oci://docker.io/envoyproxy/gateway-helm --version v1.8.0 -n envoy-gateway-system --create-namespace

# create a namespace
$ kubectl create ns demo

# deploy resources
$ kubectl -n demo apply -f statefulset-svc-pvc.yaml

$ kubectl -n demo apply -f deploy-svc-hpa.yaml

```

### KEY NOTES:
1. Ensure to know the storageClass for the statefulset using `kubectl get storageclass`
2. confirm envoy proxy pods & service have been created using `kubectl get pods -n envoy-gateway-system` and `kubectl get svc -n envoy-gateway-system`
3. Confirm deployment is successful: `kubectl -n demo get deploy,svc,po`

```
$ kubectl -n demo get deploy,svc,po
NAME                       READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/node-api   1/1     1            1           2m41s

NAME                  TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)     AGE
service/api-service   ClusterIP   10.110.55.57   <none>        3000/TCP    2m41s
service/mongo-svc     ClusterIP   None           <none>        27017/TCP   12m

NAME                            READY   STATUS    RESTARTS   AGE
pod/mongo-db-0                  1/1     Running   0          12m
pod/node-api-7b98bb6c57-sjkv4   1/1     Running   0          2m41s
```

4. Watch the autoscaler on nodejs pods:

(This will watch the HPA live. It might say /50% for a minute while it gathers metrics):
```
$ kubectl -n demo get hpa -w
NAME      REFERENCE             TARGETS              MINPODS   MAXPODS   REPLICAS   AGE
api-hpa   Deployment/node-api   cpu: <unknown>/50%   1         5         1          38s
api-hpa   Deployment/node-api   cpu: 5%/50%          1         5         1          111s
```

5. Confirm that the gateway endpoint is up - `kubectl -n demo get gateway simple-gateway`
6. Confirm that the gateway service is running - `kubectl -n demo get svc envoy-default-simple-gateway`

## How to verify everything is actually working
While Kubernetes says the containers are running, I still want to ensure the Node.js application is successfully talking to the MongoDB database. These are the two steps to prove everything is fine:

1. Check the Node.js App Logs
```
$ kubectl -n demo logs deploy/node-api

> node-k8s-api@1.0.0 start
> node server.js

Server listening on port 3000
Successfully connected to MongoDB!
```

2. Check the MongoDB Logs
```
kubectl -n demo logs mongo-db-0
```
`"msg":"Waiting for connections","attr":{"port":27017,"ssl":"off"}`   
This shows the Mongo process successfully bound to its port inside the pod and started listening.

`"msg":"Connection accepted","attr":{"remote":"10.244.0.100:45176", ...}`   
MongoDB noticed an incoming network request from the internal cluster IP 10.244.0.100 (which is the Node.js pod).

`"msg":"client metadata", ... "doc":{"driver":{"name":"nodejs|Mongoose","version":"6.20.0|8.24.0"}`   
This is the ultimate proof. MongoDB acknowledges that the connection is coming from a client running Node.js and Mongoose.

`"msg":"Connection not authenticating"`    
This is perfectly normal for a standard local development setup. It just means I haven't enabled strict username/password authentication on this Mongo instance yet, so it allowed the Node app to connect cleanly without credentials.

## Accessing the Application
### Method A: The Direct Port-Forward
Bypassing the LoadBalancer IP assignment and forwarding the port directly to the Envoy service is often the most reliable way to test locally without keeping a background tunnel running:
```
kubectl port-forward svc/simple-gateway 8888:80
```

### Method B: The Standard Minikube Tunnel
To simulate a true LoadBalancer with an External IP, open a separate terminal window and run:
```
minikube tunnel
```

Leave this terminal window open. In your main terminal, you can watch the IP get assigned:

```
kubectl -n demo get gateway simple-gateway
```


With this setup, external traffic hits your Envoy Gateway on port 80, routes through the api-route to your api-svc on port 3000, hits a scaled Node.js Pod, and reads/writes data to your persistent MongoDB instance!

### Testing the Application

Now, I will test the application by:
1. Adding, displaying items in the database.
2. Retrieving data from the database
3. Prove data persistence.
4. Driving traffic through the system, watching the database preserve your state, and forcing Kubernetes to scale up under heavy load.

Firstly, create an env variable of the GATEWAY-IP:
```
export GATEWAY_URL="EXTERNAL-IP"
```

### 1. Add and display items in the database:

Add a few items to the MongoDB cluster. This tests the application schema validation and confirms that write operations work through the headless service.

```
$ curl -X POST -H "Content-Type: application/json" -d '{"name": "First Kubernetes Deployment"}' http://$GATEWAY_URL/items

$ curl -X POST -H "Content-Type: application/json" -d '{"name": "StatefulSet Validation"}' http://$GATEWAY_URL/items
```

### 2. Retrieve the data:
Confirm the data was successfully committed to disk by querying the database.
```
$ curl http://$GATEWAY_URL/items
```

### 3. Prove data persistence:
The new pod instantly re-attached to your local storage folder via the PVC.

```
# Delete the active database pod
$ kubectl -n demo delete pod mongo-db-0

# Watch it instantly regenerate with the exact same identity
$ kubectl -n demo get pods -w
```

### 4. Stress-Testing the HPA (Watching it Auto-Scale):
Because the Node.js container request to a tight 100m (0.1 of a CPU core) and told the HPA to trigger at 50% utilization, it will only take about 50m of continuous processing to force Kubernetes to spin up more pods.

To watch this happen in real-time, I need three separate terminal windows open.

- Terminal 1: Watch the HPA Status. This shows the current CPU load vs. your target threshold.
```
kubectl -n demo get hpa api-hpa -w
```

- Terminal 2: Watch the Pod Replicas. This lets you watch Kubernetes dynamically deploy new pods as the HPA demands them.
```
kubectl -n demo get pods -l app=node-api -w
```

- Terminal 3: Will be used to flood the cluster with traffic. You can run the below loop command on the terminal or as a bash script.
```
while true; do 
  curl -s -w "\nStatus: %{http_code} | Latency: %{time_total}s" http://$GATEWAY_URL/items
  sleep 0.1  # Adds a 100ms pause to protect your local CPU
done
```

This runs in the foreground. `The sleep 0.1` throttles the script to roughly 10 requests per second. It provides a steady, gentle stream of traffic to the cluster without maxing out your laptop's cores.

`Ctrl+ C` instantly stops the loop with no leftover processes.

Run `ps aux | grep curl` to confirm all the curl processes are dead.

## Cleanup
```
# stop the minikube tunnel
Ctrl + C

# delete the namespace
$ kubectl delete namespace <namespace name>

# to delete the Helm namespace
$ kubectl delete ns envoy-gateway-system

# to uninstall Helm.
helm uninstall eg -n envoy-gateway-system

# stop minikube
$ minikube stop
```
