# VPS segura + Coolify: guia passo a passo

Escrito em 28/10/2026. **Nada daqui foi executado**: é um roteiro para você seguir na VPS nova, com as decisões explicadas.

Base: documentação oficial do Coolify (instalação, OpenSSH e firewall, em coolify.io/docs). Onde eu não consegui conferir um detalhe na documentação, está marcado com **(conferir)**.

A VPS: 2 vCPU, 4 GB de RAM, 80 GB NVMe, 2 TB de tráfego, 1 IP dedicado.

---

## 1. Como vai funcionar

```
Internet
   │
   ▼
[1] Firewall do provedor      só deixa passar o que você liberar (80 e 443; SSH no começo)
   │
   ▼
VPS Ubuntu 24.04 LTS
   ├─ [2] Firewall do servidor (UFW) + fail2ban + login só por chave SSH
   ├─ [3] Tailscale           seu túnel privado para o servidor e para o painel
   └─ Docker
        └─ Coolify           o painel que gerencia tudo
             ├─ Traefik      recebe os visitantes (80/443), põe HTTPS e entrega ao sistema certo
             ├─ painel JK Prospect X1   → painel.seudominio.com.br
             ├─ worker (motor de envio) → sem endereço público
             ├─ GOWA 1, GOWA 2, ...     → sem endereço público; só o painel e o worker falam com eles
             └─ (futuro) outros sistemas → outro.seudominio.com.br

Supabase (banco) continua na nuvem dele. Não muda.
```

Cinco palavras que você vai ouvir bastante:

| Palavra | O que é, em uma frase |
|---|---|
| **Imagem** | A "receita" pronta de um programa (ex.: a imagem do GOWA). |
| **Container** | O programa rodando, dentro de uma caixa isolada do resto do servidor. Apagou a caixa, o servidor continua limpo. |
| **Volume** | Uma pasta guardada fora da caixa. É onde ficam os dados que não podem sumir (ex.: a sessão do WhatsApp do GOWA). |
| **Rede interna** | Containers do mesmo projeto se falam pelo nome (`http://gowa-1:3000`) sem passar pela internet. |
| **Traefik** | O "porteiro". Fica nas portas 80/443, vê qual endereço o visitante pediu e encaminha para o container certo, com HTTPS automático (Let's Encrypt). |

O Coolify é o painel que opera tudo isso por você: puxa o código do GitHub, monta a imagem, sobe o container, liga o endereço e o HTTPS, guarda as senhas (variáveis de ambiente), mostra logs e faz backup do banco.

---

## 2. Docker ou não?

**Sim, Docker.** O Coolify é feito em cima de Docker; não existe "Coolify sem Docker". O instalador instala o Docker sozinho.

| Opção | Vantagem | Desvantagem | Veredito |
|---|---|---|---|
| **Docker + Coolify** | Painel pronto, HTTPS automático, deploy por Git, vários sistemas isolados, backups | Usa ~1 GB de RAM só para ele (estimativa); o painel é um alvo valioso (tem acesso root e guarda seus segredos) | **Recomendado** |
| Docker + Compose na mão | Mais leve, você controla tudo | Você faz HTTPS, deploy, logs e backup sozinho | Só se faltar RAM |
| Sem Docker (Node + PM2 + Nginx) | Mais leve ainda | Sistemas dividem o mesmo ambiente; um problema derruba tudo; atualizar vira trabalho manual | Não recomendo para "subir outros sistemas" |

O custo de segurança do Coolify é real: painéis de deploy são alvos atraentes e já tiveram falhas corrigidas em atualizações. Por isso este guia **não deixa o painel aberto na internet** e manda você atualizar com frequência.

---

## 3. Antes de começar

- [ ] **Provedor**: o painel dele tem "Firewall" (grupo de segurança)? Se sim, ele é a camada mais importante. Se não, me avise antes de instalar: aí o caminho é `ufw-docker` ou o "Compose override" do Coolify (ver seção 5, Fase 4).
- [ ] **Domínio** (ou subdomínio) seu, com acesso ao DNS. O sistema precisa de uma URL pública para as prévias (`SITE_URL`).
- [ ] **Gerenciador de senhas** (Bitwarden, 1Password...). Tudo que for gerado aqui vai para lá.
- [ ] **Conta do provedor com 2FA** ligado.
- [ ] **Repositório privado no GitHub** com o código. Hoje o projeto está só na sua pasta. Quando chegarmos lá eu preparo, **sem** `.env.local` e **sem** `gowa/storages` (são segredos e sessões de WhatsApp: nunca vão para o Git).
- [ ] **Imagem do servidor**: Ubuntu **24.04 LTS** limpo (sem Docker, Coolify ou painel pré-instalado). A documentação do Coolify pede LTS e servidor novo.

---

## 4. Decisão de acesso ao painel

| | Opção A (mais fechada) | Opção B (mais cômoda) |
|---|---|---|
| Painel do Coolify | Só pelo Tailscale: `http://100.x.y.z:8000` | Em `https://coolify.seudominio.com.br` |
| Exposição | Nenhuma na internet | Login exposto; depende de senha forte + 2FA + atualizar sempre |
| Webhook do GitHub (deploy automático ao dar push) | Não chega no painel; você manda "Deploy" na mão (ou usamos GitHub Actions) | Funciona |

**Recomendo a A.** Dá para trocar para B depois. Seus sistemas públicos (as prévias) saem por 80/443 de qualquer jeito; só o painel do Coolify fica privado.

---

## 5. Passo a passo

Faça na ordem. Em cada fase que mexe em SSH ou firewall: **não feche a sessão atual antes de testar em outra janela.**

### Fase 0: chave SSH no seu PC (PowerShell)

```powershell
ssh-keygen -t ed25519 -C "jk-vps"
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

- Defina uma frase-senha para a chave.
- A linha que começa com `ssh-ed25519` é a chave **pública**: cole no campo "chave SSH" ao criar a VPS.
- O arquivo sem `.pub` é a chave **privada**: nunca envie a ninguém.

### Fase 1: criar a VPS

Ubuntu 24.04 LTS, com a chave SSH da Fase 0, sem senha de root por e-mail. Se o provedor oferece **snapshot**, anote onde fica: você vai usar.

### Fase 2: primeiro acesso e atualização

```bash
ssh root@IP_DA_VPS
apt update && apt full-upgrade -y
timedatectl set-timezone America/Fortaleza
reboot
```

### Fase 3: seu usuário + SSH endurecido

Reconecte (`ssh root@IP_DA_VPS`) e rode:

```bash
adduser jk
usermod -aG sudo jk
rsync --archive --chown=jk:jk ~/.ssh /home/jk
```

Crie a configuração de SSH (o nome começa com `00-` de propósito: no Ubuntu 24.04 a primeira regra lida vale, e o arquivo do cloud-init liberaria senha se viesse antes):

```bash
cat > /etc/ssh/sshd_config.d/00-endurecimento.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitRootLogin prohibit-password
MaxAuthTries 3
LoginGraceTime 30
EOF
sshd -t && systemctl restart ssh
sshd -T | grep -Ei 'passwordauthentication|permitrootlogin'
```

Deve mostrar `passwordauthentication no` e `permitrootlogin without-password`.

**Teste em outra janela** antes de fechar esta:

```powershell
ssh jk@IP_DA_VPS
```

Por que o root continua com chave: o instalador do Coolify conecta no próprio servidor por SSH como root, e a documentação dele manda usar exatamente `PermitRootLogin prohibit-password` (root só entra por chave, nunca por senha).

### Fase 4: firewall (duas camadas)

**Camada 1: firewall do provedor.** Crie as regras de entrada e anexe à VPS:

| Porta | Para quê | Regra |
|---|---|---|
| 22/tcp | SSH | Seu IP, se for fixo. Se não, aberto por enquanto e fechado na Fase 6 (Tailscale) |
| 80/tcp e 443/tcp | Sites (Traefik) | Abertas para todos |
| 8000, 6001, 6002 (tcp) | Painel do Coolify direto pelo IP | **Fechadas** (nunca abra) |

**Camada 2: UFW no servidor** (como `jk`, com `sudo`):

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

> **Armadilha do Docker:** o Docker publica portas direto no iptables e **ignora o UFW**. O Coolify publica a 8000 assim. Ou seja, "negar no UFW" não protege a 8000. É por isso que a camada 1 (firewall do provedor) é obrigatória. Sem firewall no provedor, a documentação do Coolify oferece `ufw-docker` ou um "Compose override" para restringir as portas (em Servers → Firewall). Me avise e eu monto os comandos exatos antes de você instalar.

### Fase 5: fail2ban, atualizações automáticas e swap

```bash
sudo apt install -y fail2ban unattended-upgrades
sudo tee /etc/fail2ban/jail.local >/dev/null <<'EOF'
[sshd]
enabled = true
maxretry = 4
findtime = 10m
bantime = 1h
EOF
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
sudo dpkg-reconfigure -plow unattended-upgrades
```

Swap de 2 GB (o `build` do Next.js pode estourar 4 GB de RAM; sem swap o servidor trava):

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf
sudo sysctl --system
free -h
```

Opcional: reiniciar sozinho de madrugada quando uma atualização de kernel exigir. Em `/etc/apt/apt.conf.d/50unattended-upgrades` ative `Unattended-Upgrade::Automatic-Reboot "true";` e `Unattended-Upgrade::Automatic-Reboot-Time "04:30";` (o motor de envio só roda das 08h às 20h).

### Fase 6: Tailscale (seu acesso privado)

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip -4
```

- O `tailscale up` mostra um link: abra e entre com uma conta que tenha **2FA**.
- Instale o Tailscale no seu PC com a **mesma conta**.
- Teste: `ssh jk@100.x.y.z` (o IP que o comando `tailscale ip -4` mostrou).
- **Só depois de funcionar**, tire a porta 22 pública do firewall do provedor. Plano B se algo der errado: o "console" (VNC) no painel do provedor.

### Fase 7: instalar o Coolify (com o admin já criado)

Tire um **snapshot** antes. Depois, como root (`sudo -i`):

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh -o install.sh
less install.sh
```

Leia o script (é o método oficial, mas baixar e olhar antes é boa prática). Para instalar já com o admin criado (assim a página de cadastro **nunca** fica exposta; sem isso, quem abrir a porta 8000 primeiro vira administrador e dono do servidor):

```bash
read -rsp "Senha do admin do Coolify: " SENHA; echo
env ROOT_USERNAME=jk ROOT_USER_EMAIL=seu@email.com ROOT_USER_PASSWORD="$SENHA" bash install.sh
unset SENHA
```

- A senha precisa ter 8+ caracteres, com maiúscula, minúscula, número e símbolo; o e-mail precisa ter DNS válido.
- Quando terminar: `docker ps` deve listar `coolify`, `coolify-db`, `coolify-redis`, `coolify-realtime` e `coolify-proxy`.
- **Faça backup do `/data/coolify/source/.env`** (tem a `APP_KEY` que criptografa o banco do Coolify; sem ele, não há restauração). No seu PC:

```powershell
scp jk@100.x.y.z:/data/coolify/source/.env .\coolify-env-BACKUP
```

Se der "permissão negada", rode `sudo cp /data/coolify/source/.env ~/ && sudo chown jk ~/.env` no servidor antes, e apague a cópia depois. Guarde o arquivo no gerenciador de senhas, não em pasta sincronizada.

### Fase 8: configurar o Coolify

Acesse (Opção A): `http://100.x.y.z:8000`. Se ainda não tiver o Tailscale no PC, use um túnel pelo SSH: `ssh -L 8000:localhost:8000 jk@IP_DA_VPS` e abra `http://localhost:8000`.

Os nomes dos menus podem variar por versão **(conferir)**:

- [ ] Servers → `localhost` → **Validate** deve ficar verde.
- [ ] Settings: confirme que o **cadastro público está desligado**.
- [ ] Profile/Security: ligue **2FA**.
- [ ] Notificações (Telegram ou e-mail): falha de deploy, disco cheio.
- [ ] Backups: configurar um destino S3 (Cloudflare R2, Backblaze B2...) para o que o Coolify guardar.
- [ ] Atualizações: faça **manualmente**, lendo o changelog, uma vez por mês (ou na hora, se sair correção de segurança).
- [ ] (Só se escolher a Opção B) Settings → Instance's Domain = `https://coolify.seudominio.com.br`, com um registro DNS tipo A apontando para o IP.

### Fase 9: teste de ponta a ponta (antes do sistema de verdade)

Suba algo descartável para validar DNS + HTTPS:

1. No DNS do domínio, crie `teste.seudominio.com.br` (tipo A) → IP da VPS. Se usar Cloudflare, deixe em "somente DNS" (nuvem cinza) por enquanto.
2. No Coolify: Project → New Resource → **Docker Image** → `traefik/whoami`, porta `80`, domínio `https://teste.seudominio.com.br`.
3. Abra no navegador: tem que abrir com cadeado (HTTPS válido).
4. Apague o recurso e o registro DNS.

### Fase 10: reinício e auditoria

```bash
sudo reboot
```

Depois de voltar: `docker ps` com tudo de pé (o Coolify cuida de reiniciar os containers). Do seu **PC**, confirme que o que deve estar fechado está fechado:

```powershell
Test-NetConnection -ComputerName IP_DA_VPS -Port 8000
Test-NetConnection -ComputerName IP_DA_VPS -Port 22
Test-NetConnection -ComputerName IP_DA_VPS -Port 443
```

Esperado: 8000 e 22 com `TcpTestSucceeded : False`; 443 `True` (só se houver algo publicado). No servidor, `sudo ss -tlnp` mostra o que está escutando.

---

## 6. Subir outros sistemas depois (receita)

Para cada sistema novo, sempre o mesmo caminho:

1. Código em repositório privado no GitHub (com `Dockerfile` ou deixando o Nixpacks detectar).
2. Coolify: Project → New Resource → Application (GitHub) → escolher o repositório.
3. Domínio: `novo.seudominio.com.br` (registro A → IP; o HTTPS sai sozinho).
4. Variáveis de ambiente na aba "Environment" (nunca no Git).
5. Se precisar de banco: New Resource → Database (Postgres/Redis). Fica **só na rede interna**, sem porta pública.
6. Volume persistente para tudo que não pode sumir.
7. Deploy. Um erro de deploy não derruba os outros sistemas (cada um é um container).

Regras para não se arrepender: nunca marque "publicar porta" de banco; use um subdomínio por sistema; um projeto do Coolify por cliente/produto.

---

## 7. O JK Prospect X1 nesse desenho

| Peça | Container | Endereço | Observação |
|---|---|---|---|
| Painel (Next.js) | `painel` | `painel.seudominio.com.br` (público, atrás do login) | As prévias são rotas públicas; o resto exige login |
| Worker (motor de envio) | `worker` (mesma imagem, outro comando) | nenhum | Roda `node scripts/worker-loop.mjs` |
| GOWA | `gowa-1`, `gowa-2`... | nenhum | Imagem `aldinokemal2104/go-whatsapp-web-multidevice`, comando `rest --port=3000`, volume em `/app/storages`, `APP_BASIC_AUTH` forte |
| Supabase | (nuvem) | o de hoje | Sem mudança |

O que **precisa mudar no código** antes de subir (eu faço, em sessão própria, quando você pedir):

1. `Dockerfile` do painel e do worker.
2. `npm start` usa `-H 127.0.0.1`; no container precisa escutar em `0.0.0.0`.
3. O worker lê `--env-file=.env.local`; no container as variáveis vêm do Coolify.
4. Login real do Supabase (e-mail e senha): o "Entrar neste computador" só funciona em `localhost`.
5. `SITE_URL` público (para as prévias).
6. **Um endereço de GOWA por número** (hoje o painel tem uma única `GOWA_URL`). É isso que permite "1 chip = 1 GOWA = 1 proxy".

**Aviso sobre o IP:** a VPS tem **um** IP, e todo container sai por ele. IP de datacenter tende a ser visto com mais desconfiança pelo WhatsApp do que um residencial. Então: **não conecte chip nenhum a partir da VPS** até decidirmos o proxy residencial por número e fazermos o teste de 24 h com um chip saudável. O motor continua **pausado** (a fila aprovada de 29/10 não pode rodar).

---

## 8. Memória (4 GB): estimativa

| Item | RAM aproximada |
|---|---|
| Sistema + Docker | 0,3 a 0,5 GB |
| Coolify (painel, banco, redis, realtime, Traefik) | ~1 GB |
| Painel Next.js | 0,3 a 0,6 GB |
| Worker | 0,1 a 0,2 GB |
| GOWA (cada) | 0,1 a 0,25 GB |

Com 2 a 4 GOWA dá para rodar, mas fica justo durante um `build`. Por isso o swap da Fase 5. Se apertar: montar a imagem fora do servidor (GitHub Actions) e só baixá-la na VPS. **São estimativas: meça com `docker stats` e `free -h` depois do primeiro deploy.**

---

## 9. Backups (o que realmente importa)

| O quê | Como | Frequência |
|---|---|---|
| `/data/coolify/source/.env` | Cópia no gerenciador de senhas | Uma vez (e se mudar) |
| Volume do GOWA (`/app/storages`) | Backup agendado do volume para S3 ou snapshot | Diário (guarda as sessões de WhatsApp) |
| Banco de dados | Supabase já faz backup; confira o plano | Conforme o plano |
| A VPS inteira | Snapshot do provedor | Antes de cada mudança grande |

Teste a restauração uma vez. Backup que nunca foi restaurado é suposição.

---

## 10. Rotina de manutenção

- **Todo mês**: atualizar o Coolify (lendo o changelog), `sudo apt update && sudo apt upgrade`, conferir `df -h` e `docker system df`.
- **Quando avisarem de falha de segurança** no Coolify, Docker, Traefik ou Next.js: atualizar na hora.
- **A cada 90 dias**: trocar as senhas do `APP_BASIC_AUTH` dos GOWA e o segredo de webhook.
- **Sempre**: Coolify com 2FA, Tailscale com 2FA, conta do provedor com 2FA.

---

## 11. O que nunca fazer

- Abrir 8000, 6001, 6002, 5432 (Postgres), 6379 (Redis) ou 2375 (API do Docker) para a internet.
- Deixar `APP_BASIC_AUTH=admin:admin` no GOWA (é o padrão dos exemplos). Use senha forte e **sem endereço público**.
- Colocar `.env.local`, chaves ou `gowa/storages` no Git.
- Rodar `curl ... | bash` de endereço que você não conhece.
- Reaproveitar a senha do Coolify em qualquer outro lugar.
- Ligar chips pela VPS antes de resolver o IP (seção 7).
