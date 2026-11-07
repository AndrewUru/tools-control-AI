#!/bin/sh
# Copia diaria de la base de datos y las fotos. Guarda 30 días.
# cron (como root):  15 3 * * * /opt/inventario/deploy/copia-seguridad.sh
set -eu
DESTINO=/var/backups/inventario
FECHA=$(date +%F)
mkdir -p "$DESTINO"
# .backup hace una copia coherente aunque el servidor esté escribiendo
sqlite3 /opt/inventario/data/inventario.db ".backup '$DESTINO/inventario-$FECHA.db'"
gzip -f "$DESTINO/inventario-$FECHA.db"
tar -czf "$DESTINO/fotos-$FECHA.tar.gz" -C /opt/inventario uploads
find "$DESTINO" -type f -mtime +30 -delete
