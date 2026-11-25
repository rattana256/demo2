(() => {
    const ShiftApp = window.ShiftApp;
    const store = ShiftApp.store;

    function render() {
        const state = store.getState();
        const user = store.getCurrentUser();
        if (user.role !== "dev") return;

        const queueTickets = state.tickets.filter(t => t.status === "DEV_QUEUE");
        const progressTickets = state.tickets.filter(t => t.status === "DEV_PROGRESS");
        const devClosedTickets = state.tickets.filter(t => {
            if (t.status !== "CLOSED") return false;
            const closer = state.users.find(u => u.id === t.closedById);
            if (closer) return closer.role === "dev";
            const roleStr = t.closedByRoleLabel || "";
            return roleStr.includes("ทีมพัฒนา") || roleStr.includes("ทีม Dev");
        });

        document.getElementById("devQueueCount").textContent = queueTickets.length;
        document.getElementById("devProgressCount").textContent = progressTickets.length;
        document.getElementById("devClosedCount").textContent = devClosedTickets.length;

        const filterMode = document.getElementById("devFilterStatus").value;
        let display = [];
        if (filterMode === "active") {
            display = [...queueTickets, ...progressTickets];
        } else if (filterMode === "closed") {
            display = devClosedTickets;
        } else {
            display = [...queueTickets, ...progressTickets, ...devClosedTickets];
        }

        const tbody = document.getElementById("devQueueList");
        if (display.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">ไม่มีงานในคิวทีม Dev</td></tr>`;
            return;
        }

        tbody.innerHTML = display.map(ticket => {
            const meta = store.getShiftMeta(ticket);
            const branchDisplay = store.getBranchDisplay(ticket.branchId, ticket.branchName);
            const latestInfo = ticket.status === "CLOSED"
                ? `${ticket.closedAt} • ${ticket.closedByName}${ticket.closeNote ? ` — ${ticket.closeNote}` : ""}`
                : (ticket.pendingNote || "-");

            const actions = ticket.status === "CLOSED"
                ? `<button type="button" class="btn btn-outline btn-sm" data-action="timeline" data-id="${store.escapeHtml(ticket.id)}">ประวัติ</button>`
                : `
                    <button type="button" class="btn btn-primary btn-sm" data-action="dev-update" data-id="${store.escapeHtml(ticket.id)}">อัปเดต</button>
                    <button type="button" class="btn btn-warning btn-sm" data-action="dev-return" data-id="${store.escapeHtml(ticket.id)}">คืนกลาง</button>
                    <button type="button" class="btn btn-success btn-sm" data-action="close" data-id="${store.escapeHtml(ticket.id)}">ปิดงาน</button>
                    <button type="button" class="btn btn-outline btn-sm" data-action="timeline" data-id="${store.escapeHtml(ticket.id)}">ประวัติ</button>
                `;

            return `
                <tr>
                    <td><span class="ticket-id">${store.escapeHtml(ticket.id)}</span></td>
                    <td><span class="branch-tag">${store.escapeHtml(branchDisplay)}</span></td>
                    <td>${store.escapeHtml(ticket.detail)}</td>
                    <td>
                        ${store.escapeHtml(ticket.lastFromLabel || "-")}
                        ${ticket.currentOwnerName ? `<span class="sub-meta">${store.escapeHtml(ticket.currentOwnerName)}</span>` : ""}
                    </td>
                    <td>${store.escapeHtml(latestInfo)}</td>
                    <td>${store.renderAgingBadgeHtml(meta.missedShifts)}</td>
                    <td>${store.renderStatusBadgeHtml(ticket.status)}</td>
                    <td><div class="action-group">${actions}</div></td>
                </tr>
            `;
        }).join("");
    }

    function bindEvents() {
        document.getElementById("devFilterStatus").addEventListener("change", render);
    }

    ShiftApp.views.dev = { render, bindEvents };
})();
