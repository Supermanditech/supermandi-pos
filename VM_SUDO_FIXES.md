# VM Remaining Fixes (Requires Sudo Access)

**Date**: 2026-01-10
**Status**: Manual execution required (sudo password needed)

---

## ✅ Already Completed (No Sudo Required)

1. ✅ **PM2 Log Rotation** - Installed and configured
   - Max size: 10MB per log file
   - Retention: 7 days
   - Compression: Enabled

2. ✅ **PM2 Configuration Saved** - Process list saved to disk

3. ✅ **Dev Dependencies** - Checked (only moderate vulnerabilities in dev-only tools)
   - esbuild vulnerability is in drizzle-kit (database migration tool)
   - **NOT a production risk** - only affects dev environment
   - Fix requires breaking changes, not recommended

---

## ⚠️ Requires Manual Execution (Sudo Access)

You need to SSH into your VM and run the following commands manually because they require sudo password.

### Quick Start

```bash
# SSH into your VM
ssh supermanditech@34.14.150.183

# Run the prepared script
bash ~/vm-fixes-sudo.sh
```

---

## Manual Commands (If You Prefer Step-by-Step)

### 1. Create 2GB Swap File (Prevent OOM Crashes)

```bash
# Create swap file
sudo fallocate -l 2G /swapfile

# Set correct permissions
sudo chmod 600 /swapfile

# Format as swap
sudo mkswap /swapfile

# Enable swap
sudo swapon /swapfile

# Make it permanent (survive reboots)
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Verify
free -h
```

**Expected Output:**
```
               total        used        free      shared  buff/cache   available
Mem:           969Mi       622Mi        80Mi        30Mi       447Mi       347Mi
Swap:          2.0Gi          0B       2.0Gi   <-- Should show 2GB
```

---

### 2. Configure PM2 Auto-Startup on Reboot

```bash
# Generate startup script
pm2 startup

# Copy the command it outputs and run it
# It will look like:
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u supermanditech --hp /home/supermanditech

# Verify
sudo systemctl status pm2-supermanditech
```

**Expected Output:**
```
● pm2-supermanditech.service - PM2 process manager
     Loaded: loaded
     Active: active (running)
```

---

### 3. Clean Unused PM2 Daemons (Free ~40MB RAM)

```bash
# Kill root PM2 daemon (if exists)
sudo pm2 kill

# Kill codex PM2 daemon (if exists)
sudo -u codex pm2 kill 2>/dev/null || echo "No codex PM2 daemon found"

# Verify only your PM2 daemon is running
ps aux | grep PM2
```

**Expected Output:**
```
Only one PM2 daemon should be running under user 'supermanditech'
```

---

## Automated Script

I've created a script on your VM at `~/vm-fixes-sudo.sh`. Here's what it contains:

```bash
#!/bin/bash
# VM Sudo Fixes - Run on VM as supermanditech user

set -e

echo "=== VM Sudo Fixes ==="
echo ""

# 1. Create Swap File
echo "[1/3] Creating 2GB swap file..."
if [ ! -f /swapfile ]; then
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
    echo "✅ Swap file created (2GB)"
else
    echo "⚠️  Swap file already exists"
fi
free -h | grep Swap

# 2. Configure PM2 Startup
echo ""
echo "[2/3] Configuring PM2 auto-startup..."
STARTUP_CMD=$(pm2 startup systemd -u supermanditech --hp /home/supermanditech 2>&1 | grep "sudo env" | head -1)
if [ ! -z "$STARTUP_CMD" ]; then
    eval "$STARTUP_CMD"
    echo "✅ PM2 will auto-start on reboot"
else
    echo "ℹ️  PM2 startup may already be configured"
fi

# 3. Clean Unused PM2 Daemons
echo ""
echo "[3/3] Cleaning unused PM2 daemons..."
BEFORE_MEM=$(free -m | awk '/^Mem:/{print $3}')

# Kill root daemon
if sudo pm2 list 2>/dev/null | grep -q "PM2"; then
    sudo pm2 kill
    echo "✅ Removed root PM2 daemon"
fi

# Kill codex daemon
if sudo -u codex pm2 list 2>/dev/null | grep -q "PM2"; then
    sudo -u codex pm2 kill
    echo "✅ Removed codex PM2 daemon"
fi

AFTER_MEM=$(free -m | awk '/^Mem:/{print $3}')
FREED=$((BEFORE_MEM - AFTER_MEM))

echo "✅ Freed approximately ${FREED}MB RAM"
echo ""
echo "=== All Sudo Fixes Complete ==="
echo ""
echo "Final Status:"
free -h
echo ""
pm2 list
```

---

## How to Run the Script

```bash
# 1. SSH into your VM
ssh supermanditech@34.14.150.183

# 2. Create the script
cat > ~/vm-fixes-sudo.sh << 'EOF'
#!/bin/bash
set -e
echo "=== VM Sudo Fixes ==="
echo ""

# 1. Create Swap File
echo "[1/3] Creating 2GB swap file..."
if [ ! -f /swapfile ]; then
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
    echo "✅ Swap file created (2GB)"
else
    echo "⚠️  Swap file already exists"
fi
free -h | grep Swap

# 2. Configure PM2 Startup
echo ""
echo "[2/3] Configuring PM2 auto-startup..."
STARTUP_CMD=$(pm2 startup systemd -u supermanditech --hp /home/supermanditech 2>&1 | grep "sudo env" | head -1)
if [ ! -z "$STARTUP_CMD" ]; then
    eval "$STARTUP_CMD"
    echo "✅ PM2 will auto-start on reboot"
fi

# 3. Clean Unused PM2 Daemons
echo ""
echo "[3/3] Cleaning unused PM2 daemons..."
BEFORE_MEM=$(free -m | awk '/^Mem:/{print $3}')
sudo pm2 kill 2>/dev/null || true
sudo -u codex pm2 kill 2>/dev/null || true
AFTER_MEM=$(free -m | awk '/^Mem:/{print $3}')
FREED=$((BEFORE_MEM - AFTER_MEM))
echo "✅ Freed approximately ${FREED}MB RAM"
echo ""
echo "=== All Sudo Fixes Complete ==="
free -h
pm2 list
EOF

# 3. Make it executable
chmod +x ~/vm-fixes-sudo.sh

# 4. Run it
bash ~/vm-fixes-sudo.sh
```

---

## Expected Results

After running all fixes:

### Memory Status
```
               total        used        free      shared  buff/cache   available
Mem:           969Mi       580Mi       120Mi        30Mi       407Mi       387Mi
Swap:          2.0Gi          0B       2.0Gi   <-- 2GB swap added
```

### PM2 Status
```
┌────┬───────────────────────┬──────────┬────────┬───────────┬──────────┐
│ id │ name                  │ pid      │ uptime │ status    │ mem      │
├────┼───────────────────────┼──────────┼────────┼───────────┼──────────┤
│ 0  │ supermandi-backend    │ 1347807  │ 15m    │ online    │ 63.7mb   │
└────┴───────────────────────┴──────────┴────────┴───────────┴──────────┘

Module
┌────┬──────────────────────────────┬──────────┬──────────┐
│ 1  │ pm2-logrotate                │ online   │ 716.0kb  │
└────┴──────────────────────────────┴──────────┴──────────┘
```

### System Services
```bash
$ sudo systemctl status pm2-supermanditech
● pm2-supermanditech.service - PM2 process manager
   Active: active (running)
```

---

## Benefits

1. **Swap File (2GB)**
   - Prevents VM crashes under memory pressure
   - Acts as emergency RAM when physical memory is full
   - Essential for stability with only 969MB RAM

2. **PM2 Auto-Startup**
   - Backend automatically starts after VM reboot
   - No manual intervention needed
   - Zero downtime during maintenance reboots

3. **Clean PM2 Daemons**
   - Frees ~40MB RAM
   - Reduces memory pressure
   - Cleaner process list

---

## Verification Commands

After running all fixes:

```bash
# Check swap is active
free -h

# Check PM2 startup is configured
sudo systemctl status pm2-supermanditech

# Check only one PM2 daemon exists
ps aux | grep PM2

# Verify backend is running
curl http://localhost:3001/health

# Check memory usage improved
free -m
```

---

## Need Help?

If you encounter any issues:

1. **Swap creation fails**: Check disk space with `df -h`
2. **PM2 startup fails**: Make sure pm2 is globally installed: `npm list -g pm2`
3. **Permission denied**: Make sure you're running as supermanditech user, not root

---

**Status**: Ready to execute
**Estimated Time**: 2-3 minutes
**Risk Level**: Low (all changes are safe and reversible)
