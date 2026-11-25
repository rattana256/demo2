(() => {
    const ShiftApp = window.ShiftApp;
    const { SHIFT_CONFIG } = ShiftApp.config;
    const store = ShiftApp.store;

    function render() {
        const state = store.getState();
        const user = store.getCurrentUser();
        if (user.role !== "shift") return;

        const sc = SHIFT_CONFIG[user.shift];
        const onDuty = Boolean(state.shiftOnDuty[user.shift]);
        const profile = store.getUserProfile(user);

        const avatarEl = document.getElementById("shiftUserAvatar");
        if (avatarEl) {
            avatarEl.textContent = profile.initials;
            avatarEl.style.background = profile.avatarColor;
        }

        const dutyBadge = document.getElementById("shiftDutyBadge");
        dutyBadge.className = `duty-badge ${onDuty ? "on-duty" : "off-duty"}`;
        dutyBadge.textContent = onDuty ? "เข้ากะอยู่" : "ยังไม่เริ่มกะ";

        document.getElementById("shiftDutyTitle").textContent = `${sc.label} • ${sc.hours}`;
        document.getElementById("shiftDutyMeta").textContent = `${user.name} • ${profile.employeeCode}`;

        document.getElementById("startShiftBtn").disabled = onDuty;
        document.getElementById("endShiftBtn").disabled = !onDuty;
        document.getElementById("switchNextShiftBtn").classList.toggle("hidden", onDuty);
        document.getElementById("switchNextShiftBtn").textContent = `สลับไป${SHIFT_CONFIG[sc.next].label}`;

        const { openTickets, closedInSession } = store.getCurrentShiftTickets(user.shift);
        const centerWaiting = state.tickets.filter(t => t.status === "IN_CENTER").length;

        document.getElementById("shiftTotalCount").textContent = openTickets.length + closedInSession.length;
        document.getElementById("shiftClosedCount").textContent = closedInSession.length;
        document.getElementById("shiftOpenCount").textContent = openTickets.length;
        document.getElementById("shiftCenterWaitingCount").textContent = centerWaiting;

        const branchSelect = document.getElementById("newTicketBranch");
        const prevBranchVal = branchSelect.value;
        const activeBranches = state.branches.filter(b => b.active);
        branchSelect.innerHTML = `<option value="">-- เลือกสาขา --</option>` + activeBranches.map(b =>
            `<option value="${store.escapeHtml(b.id)}">${store.escapeHtml(b.code)} ${store.escapeHtml(b.name)}</option>`
        ).join("");
        if (activeBranches.some(b => b.id === prevBranchVal)) {
            branchSelect.value = prevBranchVal;
        }

        const detailInput = document.getElementById("newTicketDetail");
        const createBtn = document.getElementById("createTicketBtn");
        branchSelect.disabled = !onDuty;
        detailInput.disabled = !onDuty;
        createBtn.disabled = !onDuty;
        document.getElementById("createTicketDisabledHint").classList.toggle("hidden", onDuty);

        const filterMode = document.getElementById("shiftTaskFilter").value;
        let displayTickets = [];
        if (filterMode === "open") {
            displayTickets = openTickets;
        } else if (filterMode === "closed") {
            displayTickets = closedInSession;
        } else {
            displayTickets = [...openTickets, ...closedInSession];
        }

        const tbody = document.getElementById("shiftTaskList");
        if (displayTickets.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">ยังไม่มีงานในกะ</td></tr>`;
            return;
        }

        tbody.innerHTML = displayTickets.map(ticket => {
            const meta = store.getShiftMeta(ticket);
            const branchDisplay = store.getBranchDisplay(ticket.branchId, ticket.branchName);
            const closedInfo = ticket.status === "CLOSED"
                ? `<span class="sub-meta">${store.escapeHtml(ticket.closedAt)} • ${store.escapeHtml(ticket.closedByName)}</span>`
                : (ticket.lastFromLabel ? `<span class="sub-meta">จาก ${store.escapeHtml(ticket.lastFromLabel)}</span>` : "");

            const actionButtons = ticket.status === "IN_PROGRESS"
                ? `
                    <button type="button" class="btn btn-success btn-sm" data-action="close" data-id="${store.escapeHtml(ticket.id)}" ${onDuty ? "" : "disabled"}>ปิดงาน</button>
                    <button type="button" class="btn btn-warning btn-sm" data-action="handover" data-id="${store.escapeHtml(ticket.id)}" ${onDuty ? "" : "disabled"}>เข้ากลาง</button>
                    <button type="button" class="btn btn-purple btn-sm" data-action="escalate" data-id="${store.escapeHtml(ticket.id)}" ${onDuty ? "" : "disabled"}>ส่ง Dev</button>
                    <button type="button" class="btn btn-outline btn-sm" data-action="timeline" data-id="${store.escapeHtml(ticket.id)}">ประวัติ</button>
                `
                : `
                    <button type="button" class="btn btn-outline btn-sm" data-action="timeline" data-id="${store.escapeHtml(ticket.id)}">ประวัติ</button>
                `;

            return `
                <tr>
                    <td><span class="ticket-id">${store.escapeHtml(ticket.id)}</span></td>
                    <td><span class="branch-tag">${store.escapeHtml(branchDisplay)}</span></td>
                    <td>${store.escapeHtml(ticket.detail)}</td>
                    <td>
                        ${store.escapeHtml(ticket.createdAt)}
                        <span class="sub-meta">โดย ${store.escapeHtml(ticket.createdByName)}</span>
                    </td>
                    <td>${store.renderAgingBadgeHtml(meta.missedShifts)}</td>
                    <td>${store.renderStatusBadgeHtml(ticket.status)}${closedInfo}</td>
                    <td><div class="action-group">${actionButtons}</div></td>
                </tr>
            `;
        }).join("");
    }

    function bindEvents() {
        document.getElementById("startShiftBtn").addEventListener("click", ShiftApp.actions.startShift);
        document.getElementById("endShiftBtn").addEventListener("click", ShiftApp.actions.requestEndShift);
        document.getElementById("switchNextShiftBtn").addEventListener("click", ShiftApp.actions.switchToNextShiftUser);
        document.getElementById("openStaffBoardShortcutBtn").addEventListener("click", () => {
            ShiftApp.actions.switchView("view-staff-board");
        });

        document.getElementById("createTicketForm").addEventListener("submit", e => {
            e.preventDefault();
            const branchId = document.getElementById("newTicketBranch").value;
            const detailInput = document.getElementById("newTicketDetail");
            if (ShiftApp.actions.createTicket(branchId, detailInput.value)) {
                detailInput.value = "";
            }
        });

        document.getElementById("shiftTaskFilter").addEventListener("change", render);
    }

    ShiftApp.views.shift = { render, bindEvents };
})();
