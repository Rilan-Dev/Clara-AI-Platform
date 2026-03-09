@echo off
echo ============================================================
echo   Clara AI Platform — Starting All Applications
echo ============================================================
echo.
echo   clara-backend       → http://localhost:3000
echo   clara-omen-insurance → http://localhost:3001
echo   clara-techvision     → http://localhost:3002
echo.
echo   NOTE: Run npm install in each app first if needed.
echo ============================================================
echo.

start "Clara Backend :3010" cmd /k "cd /d %~dp0clara-backend && npm run dev"
timeout /t 4 /nobreak >nul
start "Omen Insurance :3001" cmd /k "cd /d %~dp0clara-omen-insurance && npm run dev"
timeout /t 3 /nobreak >nul
start "TechVision :3002" cmd /k "cd /d %~dp0clara-techvision && npm run dev"

echo.
echo All 3 apps launching in separate windows!
echo.
pause
