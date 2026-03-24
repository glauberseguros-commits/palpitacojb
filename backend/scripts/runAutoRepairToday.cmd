@echo off
cd /d C:\Users\glaub\palpitaco
node backend\scripts\autoRepairToday.js >> backend\logs\autoRepairToday-run.log 2>&1
