from http.server import BaseHTTPRequestHandler
import json, base64
from io import BytesIO
import os
import xlrd
from xlutils.copy import copy as xl_copy

TEMPLATE = os.path.join(os.path.dirname(__file__), 'template.xls')

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length))

        rows = body['rows']
        invoice_num = body.get('invoiceNum', '')
        din_num = body.get('dinNum', '')

        rb = xlrd.open_workbook(TEMPLATE, formatting_info=True)
        wb = xl_copy(rb)
        ws = wb.get_sheet(0)

        # Col mapping (0-indexed):
        # B=1 Protocolo, C=2 Descripción, D=3 Modelo, E=4 Cantidad
        # G=6 Trazabilidad, H=7 QR, I=8 Sistema, K=10 N°DIN, L=11 ÍtemDIN, M=12 Invoice
        for i, row in enumerate(rows):
            r = 12 + i  # products start at row 13 (index 12)
            ws.write(r, 1, row.get('proto', ''))
            ws.write(r, 2, row.get('nombre', ''))
            ws.write(r, 3, row.get('modelo', ''))
            ws.write(r, 4, int(row.get('cantidad', 0)))
            ws.write(r, 6, row.get('trazabilidad', ''))
            ws.write(r, 7, str(row.get('qr', '')))
            ws.write(r, 8, row.get('sistema', 'Sistema 1, codigo 013'))
            ws.write(r, 10, din_num)
            ws.write(r, 11, row.get('itemDin', ''))
            ws.write(r, 12, invoice_num)

        buf = BytesIO()
        wb.save(buf)
        b64 = base64.b64encode(buf.getvalue()).decode()

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({'base64': b64}).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
