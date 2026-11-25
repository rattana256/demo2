(() => {
    const ShiftApp = window.ShiftApp;
    const textDecoder = new TextDecoder("utf-8");
    const textEncoder = new TextEncoder();

    /* ---------- CRC32 for Stored ZIP Writer ---------- */
    const CRC_TABLE = (() => {
        const table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[i] = c >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        let crc = 0xffffffff;
        for (let i = 0; i < bytes.length; i++) {
            crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
        }
        return (crc ^ 0xffffffff) >>> 0;
    }

    function escapeXml(str) {
        return String(str ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    }

    /* ---------- Minimal ZIP Reader for .xlsx ---------- */
    function unzipEntries(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        const view = new DataView(arrayBuffer);

        let eocdOffset = -1;
        const minOffset = Math.max(0, bytes.length - 65558);
        for (let i = bytes.length - 22; i >= minOffset; i--) {
            if (view.getUint32(i, true) === 0x06054b50) {
                eocdOffset = i;
                break;
            }
        }
        if (eocdOffset === -1) {
            throw new Error("รูปแบบไฟล์ .xlsx ไม่ถูกต้อง (ไม่พบโครงสร้าง ZIP)");
        }

        const totalEntries = view.getUint16(eocdOffset + 10, true);
        let cdPos = view.getUint32(eocdOffset + 16, true);
        const entries = new Map();

        for (let i = 0; i < totalEntries; i++) {
            if (cdPos + 46 > bytes.length || view.getUint32(cdPos, true) !== 0x02014b50) {
                throw new Error("โครงสร้างไฟล์ .xlsx เสียหาย");
            }

            const method = view.getUint16(cdPos + 10, true);
            const compressedSize = view.getUint32(cdPos + 20, true);
            const nameLen = view.getUint16(cdPos + 28, true);
            const extraLen = view.getUint16(cdPos + 30, true);
            const commentLen = view.getUint16(cdPos + 32, true);
            const localHeaderOffset = view.getUint32(cdPos + 42, true);

            const nameBytes = bytes.subarray(cdPos + 46, cdPos + 46 + nameLen);
            const name = textDecoder.decode(nameBytes).replace(/^\/+/, "");
            cdPos += 46 + nameLen + extraLen + commentLen;

            if (localHeaderOffset + 30 > bytes.length || view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
                continue;
            }

            const lhNameLen = view.getUint16(localHeaderOffset + 26, true);
            const lhExtraLen = view.getUint16(localHeaderOffset + 28, true);
            const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
            const compressedBytes = bytes.subarray(dataStart, dataStart + compressedSize);

            entries.set(name.toLowerCase(), { name, method, compressedBytes });
        }

        return entries;
    }

    async function extractEntryText(entry) {
        if (!entry) return null;
        if (entry.method === 0) {
            return textDecoder.decode(entry.compressedBytes);
        }
        if (entry.method === 8) {
            if (typeof DecompressionStream !== "function") {
                throw new Error("เบราว์เซอร์ไม่รองรับ DecompressionStream กรุณาใช้ Chrome/Edge รุ่นล่าสุด หรือไฟล์ .csv");
            }
            const ds = new DecompressionStream("deflate-raw");
            const stream = new Blob([entry.compressedBytes]).stream().pipeThrough(ds);
            return await new Response(stream).text();
        }
        throw new Error(`ไม่รองรับวิธีบีบอัดในไฟล์ .xlsx (method ${entry.method})`);
    }

    function colRefToIndex(ref) {
        const match = String(ref || "").toUpperCase().match(/^([A-Z]+)/);
        if (!match) return -1;
        let idx = 0;
        const letters = match[1];
        for (let i = 0; i < letters.length; i++) {
            idx = idx * 26 + (letters.charCodeAt(i) - 64);
        }
        return idx - 1;
    }

    function indexToColLetters(index) {
        let n = index + 1;
        let str = "";
        while (n > 0) {
            const rem = (n - 1) % 26;
            str = String.fromCharCode(65 + rem) + str;
            n = Math.floor((n - 1) / 26);
        }
        return str;
    }

    function collectSiText(siEl) {
        const tNodes = siEl.getElementsByTagName("t");
        let text = "";
        for (let i = 0; i < tNodes.length; i++) {
            let p = tNodes[i].parentNode;
            let isPhonetic = false;
            while (p && p !== siEl) {
                if (p.localName === "rPh") {
                    isPhonetic = true;
                    break;
                }
                p = p.parentNode;
            }
            if (!isPhonetic) {
                text += tNodes[i].textContent || "";
            }
        }
        return text;
    }

    function resolveFirstSheetPath(workbookXml, relsXml) {
        const fallback = "xl/worksheets/sheet1.xml";
        if (!workbookXml) return fallback;

        const parser = new DOMParser();
        const wbDoc = parser.parseFromString(workbookXml, "application/xml");
        const firstSheet = wbDoc.getElementsByTagName("sheet")[0];
        if (!firstSheet) return fallback;

        let rId = firstSheet.getAttribute("r:id");
        if (!rId) {
            for (let i = 0; i < firstSheet.attributes.length; i++) {
                const attr = firstSheet.attributes[i];
                if (attr.localName === "id" && attr.name !== "sheetId") {
                    rId = attr.value;
                    break;
                }
            }
        }
        if (!rId || !relsXml) return fallback;

        const relsDoc = parser.parseFromString(relsXml, "application/xml");
        const rels = relsDoc.getElementsByTagName("Relationship");
        for (let i = 0; i < rels.length; i++) {
            if (rels[i].getAttribute("Id") === rId) {
                const target = (rels[i].getAttribute("Target") || "").replace(/\\/g, "/");
                if (!target) return fallback;
                return target.startsWith("/")
                    ? target.slice(1).toLowerCase()
                    : (target.toLowerCase().startsWith("xl/") ? target.toLowerCase() : `xl/${target.toLowerCase()}`);
            }
        }
        return fallback;
    }

    async function parseXlsxBuffer(arrayBuffer) {
        const entries = unzipEntries(arrayBuffer);
        const parser = new DOMParser();

        const sharedStrings = [];
        const sstText = await extractEntryText(entries.get("xl/sharedstrings.xml"));
        if (sstText) {
            const sstDoc = parser.parseFromString(sstText, "application/xml");
            const siNodes = sstDoc.getElementsByTagName("si");
            for (let i = 0; i < siNodes.length; i++) {
                sharedStrings.push(collectSiText(siNodes[i]));
            }
        }

        const wbText = await extractEntryText(entries.get("xl/workbook.xml"));
        const relsText = await extractEntryText(entries.get("xl/_rels/workbook.xml.rels"));
        const sheetPath = resolveFirstSheetPath(wbText, relsText);

        let sheetEntry = entries.get(sheetPath);
        if (!sheetEntry) {
            for (const [key, val] of entries.entries()) {
                if (key.startsWith("xl/worksheets/sheet") && key.endsWith(".xml")) {
                    sheetEntry = val;
                    break;
                }
            }
        }
        const sheetXml = await extractEntryText(sheetEntry);
        if (!sheetXml) {
            throw new Error("ไม่พบชีตข้อมูลในไฟล์ .xlsx");
        }

        const sheetDoc = parser.parseFromString(sheetXml, "application/xml");
        const rowNodes = sheetDoc.getElementsByTagName("row");
        const rows = [];

        for (let r = 0; r < rowNodes.length; r++) {
            const cellNodes = rowNodes[r].getElementsByTagName("c");
            const sparse = [];
            let seqIdx = 0;

            for (let c = 0; c < cellNodes.length; c++) {
                const cell = cellNodes[c];
                const refCol = colRefToIndex(cell.getAttribute("r"));
                const colIdx = refCol >= 0 ? refCol : seqIdx;
                seqIdx = colIdx + 1;

                const type = cell.getAttribute("t") || "n";
                let value = "";

                if (type === "inlineStr") {
                    const isNode = cell.getElementsByTagName("is")[0];
                    if (isNode) value = collectSiText(isNode);
                } else {
                    const vNode = cell.getElementsByTagName("v")[0];
                    const rawVal = vNode ? (vNode.textContent || "") : "";
                    if (type === "s") {
                        value = rawVal !== "" ? (sharedStrings[Number(rawVal)] ?? "") : "";
                    } else if (type === "b") {
                        value = rawVal === "1" ? "TRUE" : "FALSE";
                    } else {
                        value = rawVal;
                    }
                }

                sparse[colIdx] = String(value).trim();
            }

            const dense = Array.from({ length: sparse.length }, (_, idx) => sparse[idx] ?? "");
            if (dense.some(cell => cell !== "")) {
                rows.push(dense);
            }
        }

        return rows;
    }

    /* ---------- CSV Parser ---------- */
    function detectCsvDelimiter(firstLine) {
        const counts = {
            ",": (firstLine.match(/,/g) || []).length,
            ";": (firstLine.match(/;/g) || []).length,
            "\t": (firstLine.match(/\t/g) || []).length
        };
        if (counts["\t"] > counts[","] && counts["\t"] >= counts[";"]) return "\t";
        if (counts[";"] > counts[","]) return ";";
        return ",";
    }

    function parseCsvText(rawText) {
        const text = String(rawText || "").replace(/^\uFEFF/, "");
        const firstLine = text.split(/\r?\n/).find(l => l.trim() !== "") || "";
        const delim = detectCsvDelimiter(firstLine);

        const rows = [];
        let row = [];
        let field = "";
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (text[i + 1] === '"') {
                        field += '"';
                        i += 1;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    field += ch;
                }
            } else if (ch === '"') {
                inQuotes = true;
            } else if (ch === delim) {
                row.push(field.trim());
                field = "";
            } else if (ch === "\r" || ch === "\n") {
                if (ch === "\r" && text[i + 1] === "\n") i += 1;
                row.push(field.trim());
                if (row.some(cell => cell !== "")) rows.push(row);
                row = [];
                field = "";
            } else {
                field += ch;
            }
        }

        row.push(field.trim());
        if (row.some(cell => cell !== "")) rows.push(row);
        return rows;
    }

    async function readSpreadsheetFile(file) {
        if (!file) throw new Error("ไม่ได้เลือกไฟล์");
        const lowerName = (file.name || "").toLowerCase();

        if (lowerName.endsWith(".xls")) {
            throw new Error("ไม่รองรับไฟล์ .xls รุ่นเก่า กรุณาบันทึกเป็น .xlsx หรือ .csv");
        }
        if (lowerName.endsWith(".csv")) {
            const text = await file.text();
            return parseCsvText(text);
        }
        if (lowerName.endsWith(".xlsx")) {
            const buffer = await file.arrayBuffer();
            return await parseXlsxBuffer(buffer);
        }
        throw new Error("รองรับเฉพาะไฟล์ .xlsx และ .csv เท่านั้น");
    }

    /* ---------- User Mapping & Validation ---------- */
    const HEADER_ALIASES = {
        code: ["รหัส", "รหัสพนักงาน", "เลขประจำตัว", "username", "code", "empcode", "employee_code", "id"],
        name: ["ชื่อ", "ชื่อ-นามสกุล", "ชื่อพนักงาน", "name", "fullname", "full_name"],
        role: ["บทบาท", "ตำแหน่ง", "role", "position"],
        shift: ["กะ", "กะทำงาน", "เวลางาน", "เวลาทำงาน", "shift", "time", "schedule"]
    };

    function normalizeHeader(val) {
        return String(val || "").trim().toLowerCase().replace(/\s+/g, "");
    }

    function mapHeaderColumns(headerRow) {
        const colMap = { code: -1, name: -1, role: -1, shift: -1 };
        headerRow.forEach((cell, idx) => {
            const norm = normalizeHeader(cell);
            for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
                if (colMap[key] === -1 && aliases.some(a => norm === a.replace(/\s+/g, ""))) {
                    colMap[key] = idx;
                }
            }
        });
        return colMap;
    }

    function normalizeRole(rawRole) {
        const val = String(rawRole || "").trim().toLowerCase();
        if (!val || val === "shift" || val === "staff" || val.includes("พนักงานกะ") || val.includes("พนักงานประจำกะ") || val.includes("ช่าง")) {
            return "shift";
        }
        if (val === "dev" || val.includes("ทีม dev") || val.includes("ทีมพัฒนา") || val.includes("developer")) {
            return "dev";
        }
        if (val === "admin" || val.includes("หัวหน้างาน") || val.includes("ผู้ดูแลระบบ") || val.includes("supervisor")) {
            return "admin";
        }
        return null;
    }

    function normalizeShift(rawShift) {
        const val = String(rawShift || "").trim().toLowerCase().replace(/:/g, ".");
        if (!val) return null;
        if (val === "a" || val.includes("กลางวัน") || val === "day" || val.includes("08.30") || val.includes("8.30")) {
            return "A";
        }
        if (val === "b" || val.includes("เย็น") || val === "evening" || val.includes("16.30")) {
            return "B";
        }
        if (val === "c" || val.includes("เช้า") || val.includes("ดึก") || val === "morning" || val === "night" || val.includes("00.30") || val.includes("0.30")) {
            return "C";
        }
        return null;
    }

    function normalizeName(val) {
        return String(val || "").trim().replace(/\s+/g, " ").toLowerCase();
    }

    function parseUsersFromRows(rows, existingUsers) {
        if (!Array.isArray(rows) || rows.length < 2) {
            throw new Error("ไฟล์ต้องมีหัวตารางอย่างน้อย 1 แถว และข้อมูลพนักงานอย่างน้อย 1 แถว");
        }

        const colMap = mapHeaderColumns(rows[0]);
        if (colMap.code === -1 || colMap.name === -1) {
            throw new Error("ไม่พบคอลัมน์ 'รหัส' หรือ 'ชื่อ' ในแถวหัวตาราง");
        }

        const seenInFile = new Set();
        const seenNamesInFile = new Set();
        const existingNames = new Set(
            (existingUsers || []).map(u => normalizeName(u.name)).filter(Boolean)
        );
        const items = [];

        for (let r = 1; r < rows.length; r++) {
            const row = rows[r];
            const code = String(row[colMap.code] ?? "").trim();
            const name = String(row[colMap.name] ?? "").trim();
            const rawRole = colMap.role >= 0 ? String(row[colMap.role] ?? "").trim() : "";
            const rawShift = colMap.shift >= 0 ? String(row[colMap.shift] ?? "").trim() : "";

            const rowErrors = [];
            if (!code) rowErrors.push("ไม่มีรหัส");
            if (!name) rowErrors.push("ไม่มีชื่อ");

            const codeLower = code.toLowerCase();
            if (code) {
                if (seenInFile.has(codeLower)) {
                    rowErrors.push("รหัสซ้ำในไฟล์");
                }
                seenInFile.add(codeLower);
            }

            const role = normalizeRole(rawRole);
            if (!role) {
                rowErrors.push(`บทบาทไม่ถูกต้อง (${rawRole})`);
            }

            let shift = null;
            if (role === "shift") {
                shift = normalizeShift(rawShift);
                if (!shift) {
                    rowErrors.push(rawShift ? `กะไม่ถูกต้อง (${rawShift})` : "ต้องระบุกะ (กลางวัน/เย็น/เช้า)");
                }
            }

            const existing = code
                ? existingUsers.find(u =>
                    (u.username || "").toLowerCase() === codeLower ||
                    (u.employeeCode || "").toLowerCase() === codeLower
                )
                : null;

            const valid = rowErrors.length === 0;
            const warnings = [];
            const nameNorm = normalizeName(name);
            if (valid && nameNorm) {
                if (!existing && existingNames.has(nameNorm)) {
                    warnings.push("ชื่อซ้ำในระบบ");
                }
                if (seenNamesInFile.has(nameNorm)) {
                    warnings.push("ชื่อซ้ำในไฟล์");
                }
                seenNamesInFile.add(nameNorm);
            }

            items.push({
                rowNumber: r + 1,
                code,
                name,
                role: role || "shift",
                shift,
                rawRole: rawRole || "พนักงานกะ",
                rawShift,
                mode: existing ? "update" : "create",
                existingId: existing ? existing.id : null,
                valid,
                error: rowErrors.join(", "),
                warnings,
                defaultChecked: valid && warnings.length === 0
            });
        }

        return {
            items,
            validItems: items.filter(i => i.valid),
            createCount: items.filter(i => i.valid && i.mode === "create").length,
            updateCount: items.filter(i => i.valid && i.mode === "update").length,
            warningCount: items.filter(i => i.valid && i.warnings.length > 0).length,
            errorCount: items.filter(i => !i.valid).length
        };
    }

    /* ---------- Minimal Stored ZIP Writer for Template .xlsx ---------- */
    function buildStoredZip(files) {
        const localParts = [];
        const centralParts = [];
        let offset = 0;

        files.forEach(file => {
            const nameBytes = textEncoder.encode(file.name);
            const dataBytes = textEncoder.encode(file.content);
            const crc = crc32(dataBytes);

            const lh = new Uint8Array(30 + nameBytes.length);
            const lhView = new DataView(lh.buffer);
            lhView.setUint32(0, 0x04034b50, true);
            lhView.setUint16(4, 20, true);
            lhView.setUint16(6, 0x0800, true); // UTF-8 filename flag
            lhView.setUint16(8, 0, true);      // Method 0: Stored
            lhView.setUint32(14, crc, true);
            lhView.setUint32(18, dataBytes.length, true);
            lhView.setUint32(22, dataBytes.length, true);
            lhView.setUint16(26, nameBytes.length, true);
            lh.set(nameBytes, 30);

            localParts.push(lh, dataBytes);

            const cd = new Uint8Array(46 + nameBytes.length);
            const cdView = new DataView(cd.buffer);
            cdView.setUint32(0, 0x02014b50, true);
            cdView.setUint16(4, 20, true);
            cdView.setUint16(6, 20, true);
            cdView.setUint16(8, 0x0800, true);
            cdView.setUint16(10, 0, true);
            cdView.setUint32(16, crc, true);
            cdView.setUint32(20, dataBytes.length, true);
            cdView.setUint32(24, dataBytes.length, true);
            cdView.setUint16(28, nameBytes.length, true);
            cdView.setUint32(42, offset, true);
            cd.set(nameBytes, 46);

            centralParts.push(cd);
            offset += lh.length + dataBytes.length;
        });

        const cdSize = centralParts.reduce((sum, p) => sum + p.length, 0);
        const eocd = new Uint8Array(22);
        const eocdView = new DataView(eocd.buffer);
        eocdView.setUint32(0, 0x06054b50, true);
        eocdView.setUint16(8, files.length, true);
        eocdView.setUint16(10, files.length, true);
        eocdView.setUint32(12, cdSize, true);
        eocdView.setUint32(16, offset, true);

        return new Blob([...localParts, ...centralParts, eocd], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });
    }

    function createTemplateXlsxBlob() {
        const sampleRows = [
            ["รหัส", "ชื่อ", "บทบาท", "กะ"],
            ["202601", "สมชาย ทดสอบ", "พนักงานกะ", "กลางวัน"],
            ["202602", "สมหญิง ทดสอบ", "พนักงานกะ", "เย็น"],
            ["202603", "วิชัย ทดสอบ", "พนักงานกะ", "เช้า"]
        ];

        const rowsXml = sampleRows.map((row, rIdx) => {
            const cells = row.map((val, cIdx) => {
                const ref = `${indexToColLetters(cIdx)}${rIdx + 1}`;
                return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(val)}</t></is></c>`;
            }).join("");
            return `<row r="${rIdx + 1}">${cells}</row>`;
        }).join("");

        const sheetXml =
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
            `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
            `<cols><col min="1" max="1" width="16" customWidth="1"/><col min="2" max="2" width="24" customWidth="1"/><col min="3" max="3" width="18" customWidth="1"/><col min="4" max="4" width="18" customWidth="1"/></cols>` +
            `<sheetData>${rowsXml}</sheetData>` +
            `</worksheet>`;

        const contentTypesXml =
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
            `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
            `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
            `<Default Extension="xml" ContentType="application/xml"/>` +
            `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
            `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
            `</Types>`;

        const rootRelsXml =
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
            `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
            `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
            `</Relationships>`;

        const workbookXml =
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
            `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
            `<sheets><sheet name="Users" sheetId="1" r:id="rId1"/></sheets>` +
            `</workbook>`;

        const workbookRelsXml =
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
            `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
            `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
            `</Relationships>`;

        return buildStoredZip([
            { name: "[Content_Types].xml", content: contentTypesXml },
            { name: "_rels/.rels", content: rootRelsXml },
            { name: "xl/workbook.xml", content: workbookXml },
            { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml },
            { name: "xl/worksheets/sheet1.xml", content: sheetXml }
        ]);
    }

    function downloadTemplateXlsx() {
        const blob = createTemplateXlsxBlob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "template_users.xlsx";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        ShiftApp.store.showToast("ดาวน์โหลดไฟล์ตัวอย่าง template_users.xlsx แล้ว", "success");
    }

    ShiftApp.xlsx = {
        parseXlsxBuffer,
        parseCsvText,
        readSpreadsheetFile,
        parseUsersFromRows,
        createTemplateXlsxBlob,
        downloadTemplateXlsx
    };
})();
