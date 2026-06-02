# Static IP Setup Guide

The ASG Monitoring Dashboard runs on a fixed IP address (`192.168.68.69:8001`) so the AI Assistant (Flutter app) and other devices can reliably reach it. This guide covers two ways to set up a static IP.

---

## Option A: Set Static IP on the Dashboard PC (Recommended)

This method works without needing access to the router. Set the IP directly on the PC's network adapter.

### Windows 10/11

1. Open **Settings** → **Network & Internet** → **Advanced network settings** → **More network adapter options**
   
   *Or:* Press `Win + R`, type `ncpa.cpl`, press Enter.

2. Right-click your active network adapter (usually **Ethernet** or **Wi-Fi**) → **Properties**.

3. Select **Internet Protocol Version 4 (TCP/IPv4)** → click **Properties**.

4. Select **Use the following IP address** and enter:

   | Field | Value |
   |-------|-------|
   | **IP address** | `192.168.68.69` |
   | **Subnet mask** | `255.255.255.0` |
   | **Default gateway** | `192.168.68.1` (adjust to your router's gateway) |

5. Select **Use the following DNS server addresses**:

   | Field | Value |
   |-------|-------|
   | **Preferred DNS** | `192.168.68.1` (or `8.8.8.8`) |
   | **Alternate DNS** | `8.8.4.4` |

6. Click **OK** → **Close**.

### Verify

Open PowerShell and run:

```powershell
ipconfig
```

Confirm the adapter shows `192.168.68.69`.

Then test that the dashboard API responds:

```powershell
curl http://192.168.68.69:8001/api/notifications
```

---

## Option B: DHCP Reservation in Router

If you prefer the PC to remain on DHCP (automatic IP), reserve `192.168.68.69` in your router so it always gets the same address.

### Steps

1. On the dashboard PC, open PowerShell and run:
   ```powershell
   ipconfig /all
   ```
   Note the **Physical Address** (MAC address) of your active adapter (e.g., `AA-BB-CC-DD-EE-FF`).

2. Log into your router's admin page (typically `http://192.168.68.1`).

3. Look for **DHCP Reservation** or **Static DHCP** (location varies by router brand — try "LAN Setup", "DHCP Server", or "Address Reservation").

4. Add a new reservation:
   - **MAC Address:** The address from step 1
   - **Reserved IP:** `192.168.68.69`

5. Save and reboot the router (or renew the IP on the PC).

### Renew IP on the PC

```powershell
ipconfig /release
ipconfig /renew
ipconfig
```

Confirm the IP is now `192.168.68.69`.

---

## Firewall Note

After setting the static IP, make sure port 8001 is open in Windows Firewall. See [`FIREWALL_SETUP.md`](./FIREWALL_SETUP.md) for instructions (or `../FIREWALL_SETUP.md` from the `docs/` folder).

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| No internet after setting static IP | Wrong gateway or DNS | Double-check gateway matches your router (usually `192.168.68.1` or `192.168.1.1`) |
| IP conflict error | Another device already using `192.168.68.69` | Choose a different IP (e.g., `192.168.68.70`) or check for duplicates |
| Can't reach `192.168.68.69:8001` from another device | Firewall blocking port 8001 | Run the firewall setup script or add rule manually (see `FIREWALL_SETUP.md`) |
| `ipconfig` shows `169.254.x.x` (APIPA) | Static IP settings are incorrect | Double-check subnet mask (`255.255.255.0`) and gateway, or switch back to DHCP and try Option B |
