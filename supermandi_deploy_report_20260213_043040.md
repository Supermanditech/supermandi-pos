# SuperMandi Deploy Report (20260213_043040)

## Git

### .env keys (names only)


`"
  Add-Line "
}

# -------------------
# Best-effort scan for endpoints / version markers
# -------------------
Add-Line 


## GCP Staging (optional; requires gcloud)

- Project: $PROJECT_ID"
Add-Line 
- Cloud SQL instance: $SQL_INSTANCE"
Add-Line "

# Cloud Run list
Add-Line 

`"
try {
   = gcloud run services list --region asia-south1 --format json | ConvertFrom-Json
  foreach ( in ) {
     = .metadata.name
     = .status.url
     = 

### Cloud Run service details (redacted)

### Cloud SQL instance basics (redacted)

