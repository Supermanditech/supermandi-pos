# SuperMandi VM Access Details

## VM Information
- **Host/IP**: 34.14.220.171
- **Zone**: asia-south1-a
- **Project**: supermandi-backend
- **VM Name**: supermandi-backend-vm

## SSH Access

### Primary Access (claude user)
```bash
ssh claude@34.14.220.171
```

### Alternative Access (supermanditech user)
```bash
ssh supermanditech@34.14.220.171
# Password: Supermandi@123
```

### GCloud SSH
```bash
gcloud compute ssh \
  --zone "asia-south1-a" \
  "supermandi-backend-vm" \
  --project "supermandi-backend"
```

## SSH Keys Authorized

### Claude Code VM Access Key
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIE/FDEkZbVV3m3uR2F9WmfKNEpCEhrPTax3gl8KGACFR claude-code-vm-access
```

### SuperMandi GitHub Key
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKyLta6LMjELpJ5gToJhw3Cd5U5YWx+G7bDP3fK/ypGH supermandi@github
```

## Quick Commands

### Get External IP (from within VM)
```bash
curl -s -H "Metadata-Flavor: Google" \
  http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip
```

### Restart PM2 Services
```bash
sudo systemctl restart pm2-supermanditech
```

### View Logs
```bash
sudo tail -f /var/log/syslog
```

## VS Code Remote SSH
1. Install "Remote - SSH" extension
2. Press F1 → "Remote-SSH: Connect to Host"
3. Enter: supermanditech@34.14.220.171
4. Password: Supermandi@123
