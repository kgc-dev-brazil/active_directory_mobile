# atualizar.ps1 - Script de deploy e atualização do KAD Mobile
Write-Host "=== Iniciando atualização do KAD Mobile ===" -ForegroundColor Cyan

# 1. Parar o serviço temporariamente
Write-Host "1. Parando o serviço KADMobileService..." -ForegroundColor Yellow
nssm stop KADMobileService

# 2. Navegar até a pasta do projeto e puxar o código do Git
Write-Host "2. Atualizando código via Git..." -ForegroundColor Yellow
cd C:\Apps\KAD_Mobile\active_directory_mobile
git pull origin main

# 3. Atualizar dependências no ambiente virtual caso o requirements.txt tenha mudado
Write-Host "3. Verificando dependências no venv..." -ForegroundColor Yellow
.\venv\Scripts\python.exe -m pip install -r requirements.txt

# 4. Iniciar o serviço novamente
Write-Host "4. Reiniciando o serviço KADMobileService..." -ForegroundColor Yellow
nssm start KADMobileService

# 5. Conferir o status final
$status = nssm status KADMobileService
Write-Host "=== Atualização concluída! Status atual: $status ===" -ForegroundColor Green