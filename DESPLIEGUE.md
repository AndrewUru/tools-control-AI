# Despliegue del servidor común

Un solo servidor en la nube para todas las empresas cliente. Cada empresa ve solo sus datos.

## Qué contratar

| Qué | Recomendación | Coste aproximado |
|---|---|---|
| Servidor | Hetzner Cloud **CX22** (2 vCPU, 4 GB), ubicación Alemania o Finlandia (UE, RGPD), Ubuntu 24.04 | ~5 €/mes |
| Copias automáticas del servidor | Opción *Backups* de Hetzner | +20 % del servidor |
| Dominio | Cualquier registrador (p. ej. un `.es`), con un subdominio como `inventario.tudominio.es` | ~10 €/año |

Da para muchas empresas pequeñas: SQLite y Node sin dependencias consumen muy poco.

## Instalación (una vez)

En el registrador del dominio, crea un registro **A** `inventario` → IP del servidor. Después, por SSH como root:

```sh
# Node 22 (hace falta 22.13 o superior), Caddy (HTTPS automático) y sqlite3 para las copias
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs caddy sqlite3 git
useradd --system --home /opt/inventario inventario
git clone <url-del-repositorio> /opt/inventario
mkdir -p /opt/inventario/data && chown -R inventario: /opt/inventario/data /opt/inventario/uploads

cp /opt/inventario/deploy/inventario.env.ejemplo /etc/inventario.env
chmod 600 /etc/inventario.env
nano /etc/inventario.env          # dominio y CLAVE_ALTA (openssl rand -hex 24)

cp /opt/inventario/deploy/inventario.service /etc/systemd/system/
systemctl enable --now inventario

cp /opt/inventario/deploy/Caddyfile /etc/caddy/Caddyfile
nano /etc/caddy/Caddyfile         # tu dominio
systemctl reload caddy

chmod +x /opt/inventario/deploy/copia-seguridad.sh
(crontab -l 2>/dev/null; echo "15 3 * * * /opt/inventario/deploy/copia-seguridad.sh") | crontab -
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --now enable
```

Comprueba que `https://inventario.tudominio.es` muestra el inicio de sesión.

## APK para los clientes

En tu PC:

```powershell
powershell -File scripts/build-android.ps1 -Edicion nube -Servidor https://inventario.tudominio.es
```

Genera `dist/android/herramientas.apk`. Es la misma APK para todos los clientes: cada usuario entra con su email y ve su empresa.

## Dar de alta un cliente

```powershell
$env:CLAVE_ALTA = "<la clave de /etc/inventario.env>"
node scripts/nueva-empresa.js https://inventario.tudominio.es "Reformas Pérez" "Juan Pérez" juan@reformasperez.es
```

Muestra la contraseña inicial del administrador una sola vez. Él da de alta a sus empleados desde la app (Personas).

## Actualizar

```sh
cd /opt/inventario && git pull && systemctl restart inventario
```

Las migraciones de la base de datos se aplican solas al arrancar.

## Sin cobertura

La APK conectada guarda lo último consultado y deja en cola los movimientos e incidencias. Abajo aparece «Sin conexión · N pendientes de enviar»; se envían solos al volver la señal. Cada registro lleva un identificador, así que un reenvío nunca duplica nada. La hora que se guarda es la del móvil al registrarlo, salvo que tenga más de 7 días.
Sin cobertura no se puede iniciar sesión, dar de alta herramientas ni hacer cambios de administración.
