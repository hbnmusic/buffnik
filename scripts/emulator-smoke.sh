#!/usr/bin/env bash
# Runs inside the Android emulator: install the APK, start the app, report what happened.
set -u
APK="$1"
adb logcat -c
adb install -r "$APK" || { echo "INSTALL FAILED"; exit 0; }
adb shell am start -n com.buffnik.app/.MainActivity
sleep 25
adb logcat -d > emulator-logcat.txt
echo "=== process alive? ==="
adb shell pidof com.buffnik.app || echo "NOT RUNNING"
echo "=== FATAL / crash lines ==="
grep -n -E "FATAL EXCEPTION|AndroidRuntime|Process: com.buffnik|UnsatisfiedLinkError|ReactNativeJS|Fatal signal|SIGSEGV|has died|Invariant|ClassNotFound|NoSuchMethod|IllegalState" emulator-logcat.txt | head -80
echo "=== around the first fatal ==="
n=$(grep -n -m1 -E "FATAL EXCEPTION|Fatal signal" emulator-logcat.txt | cut -d: -f1)
if [ -n "${n:-}" ]; then sed -n "$((n-5)),$((n+60))p" emulator-logcat.txt; fi
