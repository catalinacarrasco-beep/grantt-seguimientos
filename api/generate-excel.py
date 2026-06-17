from http.server import BaseHTTPRequestHandler
import json
import base64
import io
import os

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        
        try:
            data = json.loads(body)
            rows = data.get('rows', [])
            invoice_num = data.get('invoiceNum', '')
            din_num = data.get('dinNum', '')
            fecha = data.get('fechaSolicitud', '')

            from xlrd import open_workbook
            from xlutils.copy import copy

            template_path = os.path.join(os.path.dirname(__file__), 'template.xls')
            rb = open_workbook(template_path, formatting_info=True)
            wb = copy(rb)
            ws = wb.get_sheet(0)

            # Fill fecha solicitud
            ws.write(2, 3, fecha)

            # Products start at index 12 (Excel row 13)
            START_ROW = 12
            for i, r in enumerate(rows):
                row_idx = START_ROW + i
                ws.write(row_idx, 1, r.get('proto', ''))
                ws.write(row_idx, 2, r.get('nombre', ''))
                ws.write(row_idx, 3, r.get('modelo', ''))
                ws.write(row_idx, 4, int(r.get('cantidad', 0)))
                ws.write(row_idx, 6, r.get('trazabilidad', ''))
                ws.write(row_idx, 7, str(r.get('qr', '')))
                ws.write(row_idx, 8, r.get('sistema', ''))
                ws.write(row_idx, 10, din_num)
                ws.write(row_idx, 11, r.get('itemDin', ''))
                ws.write(row_idx, 12, invoice_num)

            buf = io.BytesIO()
            wb.save(buf)
            b64 = base64.b64encode(buf.getvalue()).decode('utf-8')

            response = json.dumps({'base64': b64}).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(response)))
            self.end_headers()
            self.wfile.write(response)

        except Exception as e:
            error = json.dumps({'error': str(e)}).encode('utf-8')
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(error)))
            self.end_headers()
            self.wfile.write(error)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
