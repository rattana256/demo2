(() => {
    const ShiftApp = window.ShiftApp;
    const { SHIFT_CONFIG } = ShiftApp.config;
    const store = ShiftApp.store;

    const modalBackdrop = document.getElementById("modalBackdrop");
    const modalDialog = document.getElementById("modalDialog");
    const modalTitleEl = document.getElementById("modalTitle");
    const modalBodyEl = document.getElementById("modalBody");

    function open(title, bodyHtml, isWide = false) {
        modalTitleEl.textContent = title;
        modalBodyEl.innerHTML = bodyHtml;
        modalDialog.classList.toggle("modal-wide", Boolean(isWide));
        modalBackdrop.classList.remove("hidden");
    }

    function close() {
        modalBackdrop.classList.add("hidden");
        modalBodyEl.innerHTML = "";
    }

    function renderActiveReasonOptions(selectedId = "") {
        const state = store.getState();
        const activeReasons = state.reasons.filter(r => r.active);
        const placeholder = `<option value="">-- เลือกเหตุผลงานค้าง --</option>`;
        return placeholder + activeReasons.map(r => {
            const sel = r.id === selectedId ? "selected" : "";
            return `<option value="${store.escapeHtml(r.id)}" ${sel}>${store.escapeHtml(r.label)}</option>`;
        }).join("");
    }

    function openCloseTicket(ticketId) {
        const state = store.getState();
        const ticket = state.tickets.find(t => t.id === ticketId);
        if (!ticket) return;

        const user = store.getCurrentUser();
        open(
            `ปิดงาน ${ticket.id}`,
            `
            <div class="modal-ticket-summary">
                <div><strong>สาขา:</strong> ${store.escapeHtml(store.getBranchDisplay(ticket.branchId, ticket.branchName))}</div>
                <div><strong>รายละเอียด:</strong> ${store.escapeHtml(ticket.detail)}</div>
                <div><strong>ผู้ปิดงาน:</strong> ${store.escapeHtml(user.name)} (${store.escapeHtml(store.getUserRoleLabel(user))})</div>
            </div>
            <form id="modalCloseForm" class="form-field">
                <label for="modalCloseNote">สรุปผลการแก้ไข / หมายเหตุปิดงาน (ไม่บังคับ)</label>
                <textarea id="modalCloseNote" placeholder="ระบุวิธีแก้ไขหรือผลการตรวจสอบ (ระบบจะบันทึกเวลาและผู้ปิดงานให้อัตโนมัติ)..."></textarea>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" data-modal-cancel>ยกเลิก</button>
                    <button type="submit" class="btn btn-success">ยืนยันปิดงาน</button>
                </div>
            </form>
            `
        );

        modalBodyEl.querySelector("[data-modal-cancel]").addEventListener("click", close);
        document.getElementById("modalCloseForm").addEventListener("submit", e => {
            e.preventDefault();
            ShiftApp.actions.closeTicket(ticket.id, document.getElementById("modalCloseNote").value);
        });
    }

    function openHandover(ticketId) {
        const state = store.getState();
        const ticket = state.tickets.find(t => t.id === ticketId);
        if (!ticket) return;

        open(
            `โยนงานค้างเข้าถังกลาง (Center) — ${ticket.id}`,
            `
            <div class="modal-ticket-summary">
                <div><strong>สาขา:</strong> ${store.escapeHtml(store.getBranchDisplay(ticket.branchId, ticket.branchName))}</div>
                <div><strong>รายละเอียด:</strong> ${store.escapeHtml(ticket.detail)}</div>
            </div>
            <form id="modalHandoverForm" class="form-field" style="gap: 12px;">
                <div class="form-field">
                    <label for="modalHandoverReason">เหตุผลงานค้าง <span class="required">*</span></label>
                    <select id="modalHandoverReason">${renderActiveReasonOptions()}</select>
                </div>
                <div class="form-field">
                    <label for="modalHandoverNote">หมายเหตุเพิ่มเติม <span class="required">*</span></label>
                    <textarea id="modalHandoverNote" placeholder="ระบุรายละเอียดสิ่งที่ทำไปแล้วและสิ่งที่กะถัดไปต้องดำเนินการต่อ..."></textarea>
                </div>
                <p id="modalHandoverError" class="modal-error hidden"></p>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" data-modal-cancel>ยกเลิก</button>
                    <button type="submit" class="btn btn-warning">ส่งเข้าถังกลาง (Center)</button>
                </div>
            </form>
            `
        );

        modalBodyEl.querySelector("[data-modal-cancel]").addEventListener("click", close);
        document.getElementById("modalHandoverForm").addEventListener("submit", e => {
            e.preventDefault();
            const reasonId = document.getElementById("modalHandoverReason").value;
            const note = document.getElementById("modalHandoverNote").value.trim();
            const errEl = document.getElementById("modalHandoverError");

            if (!reasonId || !note) {
                errEl.textContent = "กรุณาระบุทั้งเหตุผลงานค้างและหมายเหตุเพิ่มเติมให้ครบถ้วน";
                errEl.classList.remove("hidden");
                return;
            }
            ShiftApp.actions.handoverToCenter(ticket.id, reasonId, note);
        });
    }

    function openEndShift(openTickets) {
        const user = store.getCurrentUser();
        const shiftLabel = SHIFT_CONFIG[user.shift].label;

        const itemsHtml = openTickets.map(t => `
            <div class="handover-item-card" data-ticket-id="${store.escapeHtml(t.id)}">
                <div>
                    <span class="ticket-id">${store.escapeHtml(t.id)}</span>
                    <span class="branch-tag">${store.escapeHtml(store.getBranchDisplay(t.branchId, t.branchName))}</span>
                    <div style="margin-top:4px; font-weight:600; font-size:13.5px;">${store.escapeHtml(t.detail)}</div>
                </div>
                <div class="handover-item-inputs">
                    <select class="end-reason-select" aria-label="เหตุผลงานค้าง ${store.escapeHtml(t.id)}">${renderActiveReasonOptions()}</select>
                    <input type="text" class="end-note-input" placeholder="ระบุหมายเหตุเพิ่มเติม (บังคับ)...">
                </div>
            </div>
        `).join("");

        open(
            `จบ${shiftLabel} — ส่งงานค้าง ${openTickets.length} งานเข้าถังกลาง (Center)`,
            `
            <p class="hint">ยังมีงานที่ยังไม่ปิดในกะนี้ กรุณาระบุเหตุผลงานค้างและหมายเหตุเพิ่มเติมให้ครบทุกงานก่อนจบกะ</p>
            <div class="bulk-apply-box">
                <strong style="font-size:13px;">ตัวช่วยกรอกด่วน: กำหนดเหตุผลและหมายเหตุเดียวกันให้ทุกงาน</strong>
                <div class="bulk-apply-row">
                    <select id="bulkEndReason">${renderActiveReasonOptions()}</select>
                    <input id="bulkEndNote" type="text" placeholder="หมายเหตุเพิ่มเติม...">
                    <button id="bulkApplyBtn" type="button" class="btn btn-primary btn-sm">นำไปใช้กับทุกงาน</button>
                </div>
            </div>
            <form id="modalEndShiftForm" style="display:flex; flex-direction:column; gap:10px;">
                ${itemsHtml}
                <p id="modalEndShiftError" class="modal-error hidden"></p>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" data-modal-cancel>ยกเลิก</button>
                    <button type="submit" class="btn btn-danger">ยืนยันจบกะและส่งเข้าถังกลาง</button>
                </div>
            </form>
            `,
            true
        );

        modalBodyEl.querySelector("[data-modal-cancel]").addEventListener("click", close);

        document.getElementById("bulkApplyBtn").addEventListener("click", () => {
            const bulkReason = document.getElementById("bulkEndReason").value;
            const bulkNote = document.getElementById("bulkEndNote").value;
            modalBodyEl.querySelectorAll(".handover-item-card").forEach(card => {
                if (bulkReason) card.querySelector(".end-reason-select").value = bulkReason;
                if (bulkNote.trim()) card.querySelector(".end-note-input").value = bulkNote;
            });
        });

        document.getElementById("modalEndShiftForm").addEventListener("submit", e => {
            e.preventDefault();
            const entries = [];
            let hasError = false;

            modalBodyEl.querySelectorAll(".handover-item-card").forEach(card => {
                const ticketId = card.getAttribute("data-ticket-id");
                const reasonId = card.querySelector(".end-reason-select").value;
                const note = card.querySelector(".end-note-input").value.trim();
                if (!reasonId || !note) {
                    hasError = true;
                }
                entries.push({ ticketId, reasonId, note });
            });

            const errEl = document.getElementById("modalEndShiftError");
            if (hasError) {
                errEl.textContent = "กรุณาระบุเหตุผลงานค้างและหมายเหตุเพิ่มเติมให้ครบทุกใบงาน";
                errEl.classList.remove("hidden");
                return;
            }
            ShiftApp.actions.confirmEndShiftWithHandovers(entries);
        });
    }

    function openEscalateDev(ticketId) {
        const state = store.getState();
        const ticket = state.tickets.find(t => t.id === ticketId);
        if (!ticket) return;

        open(
            `ส่งต่อทีมพัฒนา (Escalate to Dev) — ${ticket.id}`,
            `
            <div class="modal-ticket-summary">
                <div><strong>สาขา:</strong> ${store.escapeHtml(store.getBranchDisplay(ticket.branchId, ticket.branchName))}</div>
                <div><strong>รายละเอียด:</strong> ${store.escapeHtml(ticket.detail)}</div>
            </div>
            <form id="modalEscalateForm" class="form-field" style="gap: 12px;">
                <div class="form-field">
                    <label for="modalEscalateNote">อาการที่พบและเหตุผลที่ต้องส่งต่อทีม Dev <span class="required">*</span></label>
                    <textarea id="modalEscalateNote" placeholder="ระบุ Error code, ขั้นตอนที่หน้างานลองแก้แล้ว, หรือผลกระทบเพื่อให้ทีมพัฒนาตรวจสอบ..."></textarea>
                </div>
                <p id="modalEscalateError" class="modal-error hidden"></p>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" data-modal-cancel>ยกเลิก</button>
                    <button type="submit" class="btn btn-purple">ส่งต่อทีม Dev</button>
                </div>
            </form>
            `
        );

        modalBodyEl.querySelector("[data-modal-cancel]").addEventListener("click", close);
        document.getElementById("modalEscalateForm").addEventListener("submit", e => {
            e.preventDefault();
            const note = document.getElementById("modalEscalateNote").value.trim();
            const errEl = document.getElementById("modalEscalateError");
            if (!note) {
                errEl.textContent = "กรุณาระบุรายละเอียดปัญหาที่ส่งต่อทีมพัฒนา";
                errEl.classList.remove("hidden");
                return;
            }
            ShiftApp.actions.escalateToDev(ticket.id, note);
        });
    }

    function openDevUpdate(ticketId) {
        const state = store.getState();
        const ticket = state.tickets.find(t => t.id === ticketId);
        if (!ticket) return;

        open(
            `อัปเดตผลการแก้ไข — ${ticket.id}`,
            `
            <div class="modal-ticket-summary">
                <div><strong>สาขา:</strong> ${store.escapeHtml(store.getBranchDisplay(ticket.branchId, ticket.branchName))}</div>
                <div><strong>รายละเอียด:</strong> ${store.escapeHtml(ticket.detail)}</div>
            </div>
            <form id="modalDevUpdateForm" class="form-field" style="gap: 12px;">
                <div class="form-field">
                    <label for="modalDevUpdateNote">ผลการตรวจสอบ / ความคืบหน้าการแก้ไข <span class="required">*</span></label>
                    <textarea id="modalDevUpdateNote" placeholder="ระบุสาเหตุที่พบ การแก้ไขโค้ด/ระบบ หรือสถานะการทดสอบ..."></textarea>
                </div>
                <p id="modalDevUpdateError" class="modal-error hidden"></p>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" data-modal-cancel>ยกเลิก</button>
                    <button type="submit" class="btn btn-primary">บันทึกผลการแก้ไข</button>
                </div>
            </form>
            `
        );

        modalBodyEl.querySelector("[data-modal-cancel]").addEventListener("click", close);
        document.getElementById("modalDevUpdateForm").addEventListener("submit", e => {
            e.preventDefault();
            const note = document.getElementById("modalDevUpdateNote").value.trim();
            const errEl = document.getElementById("modalDevUpdateError");
            if (!note) {
                errEl.textContent = "กรุณาระบุความคืบหน้าหรือผลการแก้ไข";
                errEl.classList.remove("hidden");
                return;
            }
            ShiftApp.actions.devUpdateProgress(ticket.id, note);
        });
    }

    function openDevReturnCenter(ticketId) {
        const state = store.getState();
        const ticket = state.tickets.find(t => t.id === ticketId);
        if (!ticket) return;

        open(
            `ส่งงานกลับเข้าถังกลาง (Center) — ${ticket.id}`,
            `
            <div class="modal-ticket-summary">
                <div><strong>สาขา:</strong> ${store.escapeHtml(store.getBranchDisplay(ticket.branchId, ticket.branchName))}</div>
                <div><strong>รายละเอียด:</strong> ${store.escapeHtml(ticket.detail)}</div>
            </div>
            <form id="modalDevReturnForm" class="form-field" style="gap: 12px;">
                <div class="form-field">
                    <label for="modalDevReturnReason">สถานะ / เหตุผลที่ส่งกลับส่วนกลาง <span class="required">*</span></label>
                    <select id="modalDevReturnReason">${renderActiveReasonOptions("RS05")}</select>
                </div>
                <div class="form-field">
                    <label for="modalDevReturnNote">ผลการแก้ไขและสิ่งที่กะหน้าร้านต้องดำเนินการต่อ <span class="required">*</span></label>
                    <textarea id="modalDevReturnNote" placeholder="เช่น แก้ไขแพตช์แล้ว ให้กะหน้าร้านประสานสาขาทดสอบซ้ำและปิดงาน..."></textarea>
                </div>
                <p id="modalDevReturnError" class="modal-error hidden"></p>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" data-modal-cancel>ยกเลิก</button>
                    <button type="submit" class="btn btn-warning">ส่งกลับเข้าถังกลาง</button>
                </div>
            </form>
            `
        );

        modalBodyEl.querySelector("[data-modal-cancel]").addEventListener("click", close);
        document.getElementById("modalDevReturnForm").addEventListener("submit", e => {
            e.preventDefault();
            const reasonId = document.getElementById("modalDevReturnReason").value;
            const note = document.getElementById("modalDevReturnNote").value.trim();
            const errEl = document.getElementById("modalDevReturnError");
            if (!reasonId || !note) {
                errEl.textContent = "กรุณาระบุเหตุผลและคำแนะนำสำหรับหน้างานให้ครบถ้วน";
                errEl.classList.remove("hidden");
                return;
            }
            ShiftApp.actions.devReturnToCenter(ticket.id, reasonId, note);
        });
    }

    function openImportUsers(fileName, parsedResult) {
        const { ROLE_CONFIG } = ShiftApp.config;
        const { items, createCount, updateCount, warningCount = 0, errorCount } = parsedResult;

        const rowsHtml = items.map((item, idx) => {
            const roleLabel = ROLE_CONFIG[item.role]?.label || item.rawRole;
            const shiftLabel = item.role === "shift"
                ? (item.shift ? `${SHIFT_CONFIG[item.shift]?.label} (${SHIFT_CONFIG[item.shift]?.hours})` : (item.rawShift || "-"))
                : "-";
            const warnings = Array.isArray(item.warnings) ? item.warnings : [];

            let statusHtml = "";
            if (!item.valid) {
                statusHtml = `<span class="import-pill import-pill-error">${store.escapeHtml(item.error)}</span>`;
            } else {
                const modePill = item.mode === "update"
                    ? `<span class="import-pill import-pill-update">อัปเดต</span>`
                    : `<span class="import-pill import-pill-new">เพิ่มใหม่</span>`;
                const warnPills = warnings.map(w =>
                    `<span class="import-pill import-pill-warn">${store.escapeHtml(w)}</span>`
                ).join("");
                statusHtml = `<div class="import-status-group">${modePill}${warnPills}</div>`;
            }

            const rowClasses = [
                !item.valid ? "import-row-error" : "",
                item.valid && warnings.length > 0 ? "import-row-warning" : "",
                item.valid && !item.defaultChecked ? "import-row-unchecked" : ""
            ].filter(Boolean).join(" ");

            const checkAttr = !item.valid ? "disabled" : (item.defaultChecked ? "checked" : "");

            return `
                <tr class="${rowClasses}">
                    <td class="import-check-cell">
                        <input type="checkbox" class="import-row-checkbox" data-import-idx="${idx}" ${checkAttr} aria-label="เลือกลำดับที่ ${idx + 1}">
                    </td>
                    <td>${idx + 1}</td>
                    <td><span class="ticket-id">${store.escapeHtml(item.code || "-")}</span></td>
                    <td>${store.escapeHtml(item.name || "-")}</td>
                    <td>${store.escapeHtml(roleLabel)}</td>
                    <td>${store.escapeHtml(shiftLabel)}</td>
                    <td>${statusHtml}</td>
                </tr>
            `;
        }).join("");

        open(
            `ตรวจสอบข้อมูลนำเข้า — ${fileName}`,
            `
            <div class="import-summary-pills">
                <span class="import-pill import-pill-new">เพิ่มใหม่ ${createCount} คน</span>
                <span class="import-pill import-pill-update">อัปเดต ${updateCount} คน</span>
                ${warningCount > 0 ? `<span class="import-pill import-pill-warn">ชื่อซ้ำ/ควรตรวจ ${warningCount} แถว</span>` : ""}
                ${errorCount > 0 ? `<span class="import-pill import-pill-error">ผิดพลาด ${errorCount} แถว</span>` : ""}
            </div>
            <p class="hint" style="margin-top:0;">ติ๊กเลือกเฉพาะแถวที่ต้องการนำเข้า (แถวชื่อซ้ำจะถูกเอาติ๊กออกอัตโนมัติ) • รหัสผ่านเริ่มต้น: <strong>1234</strong></p>
            <div class="table-container" style="max-height:360px; overflow-y:auto;">
                <table style="min-width:600px;">
                    <thead>
                        <tr>
                            <th class="import-check-cell">
                                <input type="checkbox" id="modalImportSelectAll" aria-label="เลือกทั้งหมด">
                            </th>
                            <th>ลำดับ</th>
                            <th>รหัส</th>
                            <th>ชื่อ</th>
                            <th>บทบาท</th>
                            <th>กะ</th>
                            <th>ผลตรวจสอบ</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" data-modal-cancel>ยกเลิก</button>
                <button id="modalConfirmImportBtn" type="button" class="btn btn-success">ยืนยันนำเข้า (0 คน)</button>
            </div>
            `,
            true
        );

        const selectAllEl = document.getElementById("modalImportSelectAll");
        const confirmBtn = document.getElementById("modalConfirmImportBtn");
        const rowCheckboxes = Array.from(modalBodyEl.querySelectorAll(".import-row-checkbox"));
        const enabledCheckboxes = rowCheckboxes.filter(cb => !cb.disabled);

        function syncSelectionState() {
            const checkedBoxes = enabledCheckboxes.filter(cb => cb.checked);
            confirmBtn.textContent = `ยืนยันนำเข้า (${checkedBoxes.length} คน)`;
            confirmBtn.disabled = checkedBoxes.length === 0;

            if (enabledCheckboxes.length === 0) {
                selectAllEl.checked = false;
                selectAllEl.indeterminate = false;
                selectAllEl.disabled = true;
            } else {
                selectAllEl.disabled = false;
                selectAllEl.checked = checkedBoxes.length === enabledCheckboxes.length;
                selectAllEl.indeterminate = checkedBoxes.length > 0 && checkedBoxes.length < enabledCheckboxes.length;
            }

            enabledCheckboxes.forEach(cb => {
                const tr = cb.closest("tr");
                if (tr) tr.classList.toggle("import-row-unchecked", !cb.checked);
            });
        }

        selectAllEl.addEventListener("change", () => {
            const targetChecked = selectAllEl.checked;
            enabledCheckboxes.forEach(cb => {
                cb.checked = targetChecked;
            });
            syncSelectionState();
        });

        rowCheckboxes.forEach(cb => {
            cb.addEventListener("change", syncSelectionState);
        });

        syncSelectionState();

        modalBodyEl.querySelector("[data-modal-cancel]").addEventListener("click", close);
        confirmBtn.addEventListener("click", () => {
            const selectedItems = enabledCheckboxes
                .filter(cb => cb.checked)
                .map(cb => items[Number(cb.getAttribute("data-import-idx"))])
                .filter(Boolean);
            if (selectedItems.length > 0) {
                ShiftApp.actions.importAdminUsers(selectedItems);
            }
        });
    }

    function openChangePassword() {
        const user = store.getCurrentUser();
        if (!user) return;
        open(
            "เปลี่ยนรหัสผ่าน",
            `
            <div class="modal-ticket-summary">
                <div><strong>ผู้ใช้งาน:</strong> ${store.escapeHtml(user.name)} (${store.escapeHtml(user.employeeCode || user.username)})</div>
            </div>
            <form id="modalChangePasswordForm" class="form-field" style="gap: 12px;">
                <div class="form-field">
                    <label for="modalCurPassword">รหัสผ่านเดิม <span class="required">*</span></label>
                    <input id="modalCurPassword" type="password" autocomplete="current-password" placeholder="กรอกรหัสผ่านเดิม">
                </div>
                <div class="form-field">
                    <label for="modalNewPassword">รหัสผ่านใหม่ (อย่างน้อย 4 ตัวอักษร) <span class="required">*</span></label>
                    <input id="modalNewPassword" type="password" autocomplete="new-password" placeholder="ตั้งรหัสผ่านใหม่ (ห้ามใช้ 1234)">
                </div>
                <div class="form-field">
                    <label for="modalConfirmPassword">ยืนยันรหัสผ่านใหม่ <span class="required">*</span></label>
                    <input id="modalConfirmPassword" type="password" autocomplete="new-password" placeholder="กรอกรหัสผ่านใหม่อีกครั้ง">
                </div>
                <p id="modalChangePasswordError" class="modal-error hidden"></p>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" data-modal-cancel>ยกเลิก</button>
                    <button type="submit" class="btn btn-primary">บันทึกรหัสผ่านใหม่</button>
                </div>
            </form>
            `
        );

        modalBodyEl.querySelector("[data-modal-cancel]").addEventListener("click", close);
        document.getElementById("modalChangePasswordForm").addEventListener("submit", e => {
            e.preventDefault();
            const curPw = document.getElementById("modalCurPassword").value;
            const newPw = document.getElementById("modalNewPassword").value;
            const confirmPw = document.getElementById("modalConfirmPassword").value;
            const errEl = document.getElementById("modalChangePasswordError");

            const res = ShiftApp.actions.changeOwnPassword(curPw, newPw, confirmPw);
            if (!res.ok) {
                errEl.textContent = res.error;
                errEl.classList.remove("hidden");
            }
        });
    }

    function openTimeline(ticketId) {
        const state = store.getState();
        const ticket = state.tickets.find(t => t.id === ticketId);
        if (!ticket) return;
        open(
            `ประวัติการเดินทางของงาน — ${ticket.id}`,
            ShiftApp.views.tracking.buildTimelineContentHtml(ticket),
            true
        );
    }

    function bindEvents() {
        document.getElementById("modalCloseBtn").addEventListener("click", close);
        modalBackdrop.addEventListener("click", e => {
            if (e.target === modalBackdrop) close();
        });
        document.addEventListener("keydown", e => {
            if (e.key === "Escape" && !modalBackdrop.classList.contains("hidden")) {
                close();
            }
        });
    }

    ShiftApp.modals = {
        open,
        close,
        renderActiveReasonOptions,
        openCloseTicket,
        openHandover,
        openEndShift,
        openEscalateDev,
        openDevUpdate,
        openDevReturnCenter,
        openImportUsers,
        openChangePassword,
        openTimeline,
        bindEvents
    };
})();
