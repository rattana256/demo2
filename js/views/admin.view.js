(() => {
    const ShiftApp = window.ShiftApp;
    const { SHIFT_CONFIG, ROLE_CONFIG } = ShiftApp.config;
    const store = ShiftApp.store;

    function syncAdminUserShiftVisibility() {
        const role = document.getElementById("adminUserRole").value;
        document.getElementById("adminUserShiftGroup").classList.toggle("hidden", role !== "shift");
    }

    function resetAdminUserForm() {
        document.getElementById("adminUserId").value = "";
        document.getElementById("adminUserName").value = "";
        document.getElementById("adminUserUsername").value = "";
        document.getElementById("adminUserRole").value = "shift";
        document.getElementById("adminUserShift").value = "A";
        document.getElementById("adminUserSubmitBtn").textContent = "เพิ่มผู้ใช้";
        document.getElementById("adminUserCancelBtn").classList.add("hidden");
        syncAdminUserShiftVisibility();
    }

    function resetAdminBranchForm() {
        document.getElementById("adminBranchId").value = "";
        document.getElementById("adminBranchCode").value = "";
        document.getElementById("adminBranchName").value = "";
        document.getElementById("adminBranchSubmitBtn").textContent = "เพิ่มสาขา";
        document.getElementById("adminBranchCancelBtn").classList.add("hidden");
    }

    function resetAdminReasonForm() {
        document.getElementById("adminReasonId").value = "";
        document.getElementById("adminReasonLabel").value = "";
        document.getElementById("adminReasonSubmitBtn").textContent = "เพิ่มเหตุผล";
        document.getElementById("adminReasonCancelBtn").classList.add("hidden");
    }

    function render() {
        const state = store.getState();
        const user = store.getCurrentUser();
        if (user.role !== "admin") return;

        document.querySelectorAll("#adminSubTabs .sub-tab").forEach(btn => {
            btn.classList.toggle("active", btn.getAttribute("data-admin-tab") === state.activeAdminTab);
        });
        document.getElementById("admin-panel-users").classList.toggle("hidden", state.activeAdminTab !== "users");
        document.getElementById("admin-panel-branches").classList.toggle("hidden", state.activeAdminTab !== "branches");
        document.getElementById("admin-panel-reasons").classList.toggle("hidden", state.activeAdminTab !== "reasons");

        document.getElementById("adminUserList").innerHTML = state.users.map(u => {
            const shiftHours = u.role === "shift"
                ? `${SHIFT_CONFIG[u.shift]?.label} (${SHIFT_CONFIG[u.shift]?.hours})`
                : (u.role === "dev" ? ROLE_CONFIG.dev.hours : "ทุกเวลา");
            return `
                <tr>
                    <td><span class="ticket-id">${store.escapeHtml(u.id)}</span></td>
                    <td><strong>${store.escapeHtml(u.name)}</strong>${u.id === user.id ? ' <span class="muted">(คุณ)</span>' : ""}</td>
                    <td>${store.escapeHtml(u.username)}</td>
                    <td>${store.escapeHtml(ROLE_CONFIG[u.role]?.label || u.role)}</td>
                    <td>${store.escapeHtml(shiftHours)}</td>
                    <td><span class="active-pill ${u.active ? "is-active" : "is-inactive"}">${u.active ? "ใช้งาน" : "ปิดอยู่"}</span></td>
                    <td>
                        <div class="action-group">
                            <button type="button" class="btn btn-outline btn-sm" data-admin-action="edit-user" data-id="${store.escapeHtml(u.id)}">แก้</button>
                            <button type="button" class="btn btn-outline btn-sm" data-admin-action="reset-password" data-id="${store.escapeHtml(u.id)}">รีเซ็ตรหัส</button>
                            <button type="button" class="btn btn-secondary btn-sm" data-admin-action="toggle-user" data-id="${store.escapeHtml(u.id)}">${u.active ? "ปิด" : "เปิด"}</button>
                            <button type="button" class="btn btn-danger btn-sm" data-admin-action="delete-user" data-id="${store.escapeHtml(u.id)}">ลบ</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

        document.getElementById("adminBranchList").innerHTML = state.branches.map(b => {
            const allCount = state.tickets.filter(t => t.branchId === b.id).length;
            const openCount = state.tickets.filter(t => t.branchId === b.id && t.status !== "CLOSED").length;
            return `
                <tr>
                    <td><span class="ticket-id">${store.escapeHtml(b.code)}</span></td>
                    <td><strong>${store.escapeHtml(b.name)}</strong></td>
                    <td>${allCount}</td>
                    <td>${openCount}</td>
                    <td><span class="active-pill ${b.active ? "is-active" : "is-inactive"}">${b.active ? "ใช้งาน" : "ปิดอยู่"}</span></td>
                    <td>
                        <div class="action-group">
                            <button type="button" class="btn btn-outline btn-sm" data-admin-action="edit-branch" data-id="${store.escapeHtml(b.id)}">แก้</button>
                            <button type="button" class="btn btn-secondary btn-sm" data-admin-action="toggle-branch" data-id="${store.escapeHtml(b.id)}">${b.active ? "ปิด" : "เปิด"}</button>
                            <button type="button" class="btn btn-danger btn-sm" data-admin-action="delete-branch" data-id="${store.escapeHtml(b.id)}">ลบ</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

        document.getElementById("adminReasonList").innerHTML = state.reasons.map(r => {
            const openCount = state.tickets.filter(t => t.status === "IN_CENTER" && t.pendingReasonId === r.id).length;
            return `
                <tr>
                    <td><span class="ticket-id">${store.escapeHtml(r.id)}</span></td>
                    <td><strong>${store.escapeHtml(r.label)}</strong></td>
                    <td>${openCount}</td>
                    <td><span class="active-pill ${r.active ? "is-active" : "is-inactive"}">${r.active ? "ใช้งาน" : "ปิดอยู่"}</span></td>
                    <td>
                        <div class="action-group">
                            <button type="button" class="btn btn-outline btn-sm" data-admin-action="edit-reason" data-id="${store.escapeHtml(r.id)}">แก้</button>
                            <button type="button" class="btn btn-secondary btn-sm" data-admin-action="toggle-reason" data-id="${store.escapeHtml(r.id)}">${r.active ? "ปิด" : "เปิด"}</button>
                            <button type="button" class="btn btn-danger btn-sm" data-admin-action="delete-reason" data-id="${store.escapeHtml(r.id)}">ลบ</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }

    function handleAdminAction(action, id) {
        const state = store.getState();
        const actions = ShiftApp.actions;
        if (action === "edit-user") {
            const u = state.users.find(item => item.id === id);
            if (!u) return;
            document.getElementById("adminUserId").value = u.id;
            document.getElementById("adminUserName").value = u.name;
            document.getElementById("adminUserUsername").value = u.username;
            document.getElementById("adminUserRole").value = u.role;
            document.getElementById("adminUserShift").value = u.shift || "A";
            document.getElementById("adminUserSubmitBtn").textContent = "บันทึก";
            document.getElementById("adminUserCancelBtn").classList.remove("hidden");
            syncAdminUserShiftVisibility();
        } else if (action === "reset-password") {
            actions.resetUserPassword(id);
        } else if (action === "toggle-user") {
            actions.toggleUserActive(id);
        } else if (action === "delete-user") {
            actions.deleteAdminUser(id);
        } else if (action === "edit-branch") {
            const b = state.branches.find(item => item.id === id);
            if (!b) return;
            document.getElementById("adminBranchId").value = b.id;
            document.getElementById("adminBranchCode").value = b.code;
            document.getElementById("adminBranchName").value = b.name;
            document.getElementById("adminBranchSubmitBtn").textContent = "บันทึก";
            document.getElementById("adminBranchCancelBtn").classList.remove("hidden");
        } else if (action === "toggle-branch") {
            actions.toggleBranchActive(id);
        } else if (action === "delete-branch") {
            actions.deleteAdminBranch(id);
        } else if (action === "edit-reason") {
            const r = state.reasons.find(item => item.id === id);
            if (!r) return;
            document.getElementById("adminReasonId").value = r.id;
            document.getElementById("adminReasonLabel").value = r.label;
            document.getElementById("adminReasonSubmitBtn").textContent = "บันทึก";
            document.getElementById("adminReasonCancelBtn").classList.remove("hidden");
        } else if (action === "toggle-reason") {
            actions.toggleReasonActive(id);
        } else if (action === "delete-reason") {
            actions.deleteAdminReason(id);
        }
    }

    function bindEvents() {
        document.getElementById("adminSubTabs").addEventListener("click", e => {
            const btn = e.target.closest(".sub-tab");
            if (!btn) return;
            const state = store.getState();
            state.activeAdminTab = btn.getAttribute("data-admin-tab");
            render();
            store.saveState();
        });

        document.getElementById("adminUserRole").addEventListener("change", syncAdminUserShiftVisibility);
        document.getElementById("adminUserCancelBtn").addEventListener("click", resetAdminUserForm);
        document.getElementById("adminBranchCancelBtn").addEventListener("click", resetAdminBranchForm);
        document.getElementById("adminReasonCancelBtn").addEventListener("click", resetAdminReasonForm);

        document.getElementById("adminUserForm").addEventListener("submit", e => {
            e.preventDefault();
            ShiftApp.actions.saveAdminUser({
                id: document.getElementById("adminUserId").value,
                name: document.getElementById("adminUserName").value,
                username: document.getElementById("adminUserUsername").value,
                role: document.getElementById("adminUserRole").value,
                shift: document.getElementById("adminUserShift").value
            });
        });

        document.getElementById("adminImportExcelBtn").addEventListener("click", () => {
            const fileInput = document.getElementById("adminImportExcelInput");
            fileInput.value = "";
            fileInput.click();
        });

        document.getElementById("adminDownloadTemplateBtn").addEventListener("click", () => {
            ShiftApp.xlsx.downloadTemplateXlsx();
        });

        document.getElementById("adminImportExcelInput").addEventListener("change", async e => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            try {
                const state = store.getState();
                const rows = await ShiftApp.xlsx.readSpreadsheetFile(file);
                const parsed = ShiftApp.xlsx.parseUsersFromRows(rows, state.users);
                ShiftApp.modals.openImportUsers(file.name, parsed);
            } catch (err) {
                store.showToast(err && err.message ? err.message : "ไม่สามารถอ่านไฟล์ Excel ได้", "error");
            }
        });

        document.getElementById("adminBranchForm").addEventListener("submit", e => {
            e.preventDefault();
            ShiftApp.actions.saveAdminBranch({
                id: document.getElementById("adminBranchId").value,
                code: document.getElementById("adminBranchCode").value,
                name: document.getElementById("adminBranchName").value
            });
        });

        document.getElementById("adminReasonForm").addEventListener("submit", e => {
            e.preventDefault();
            ShiftApp.actions.saveAdminReason({
                id: document.getElementById("adminReasonId").value,
                label: document.getElementById("adminReasonLabel").value
            });
        });
    }

    ShiftApp.views.admin = {
        render,
        bindEvents,
        syncAdminUserShiftVisibility,
        resetAdminUserForm,
        resetAdminBranchForm,
        resetAdminReasonForm,
        handleAdminAction
    };
})();
