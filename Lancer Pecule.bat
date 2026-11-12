@echo off
rem Double-clique sur ce fichier pour lancer Pécule dans ton navigateur.
cd /d "%~dp0"
if not exist node_modules (
  echo Installation des dependances, premiere fois uniquement...
  call npm install
)
call npm start
