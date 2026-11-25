(() => {
    const ShiftApp = window.ShiftApp;
    const { SHIFT_CONFIG } = ShiftApp.config;
    const store = ShiftApp.store;

    function render() {
        const state = store.getState();
        const user = store.getCurrentUser();
        const canPickUp = store.isShiftUserOnDuty(user);

        const offDutyHint = document.getElementById("centerOffDutyHint");
        if (user.role === "shift" && !canPickUp) {
            const shiftLabel = SHIFT_CONFIG[user.shift].label;
            document.getElementById("centerOffDutyText").textContent =
                `ยังไม่เริ่ม${shiftLabel} — กดเริ่มกะเพื่อรับงาน`;
            document.getElementById("centerQuickStartShiftBtn").textContent = `เริ่ม${shiftLabel}`;
            offDutyHint.classList.remove("hidden");
        } else {
            offDutyHint.classList.add("hidden");
        }

        const branchFilter = document.getElementById("centerFilterBranch");
        const reasonFilter = document.getElementById("centerFilterReason");
        store.populateSelectWithOptions(
            branchFilter,
            "ทุกสาขา",
            state.branches.map(b => ({ value: b.id, label: `${b.code} ${b.name}` })),
            branchFilter.value
        );
        store.populateSelectWithOptions(
            reasonFilter,
            "ทุกเหตุผล",
            state.reasons.map(r => ({ value: r.id, label: r.label })),
            reasonFilter.value
        );

        const allCenterTickets = state.tickets.filter(t => t.status === "IN_CENTER");
        const filtered = allCenterTickets.filter(t => {
            if (branchFilter.value && t.branchId !== branchFilter.value) return false;
            if (reasonFilter.value && t.pendingReasonId !== reasonFilter.value) return false;
            return true;
        });

        const pickUpAllBtn = document.getElementById("pickUpAllBtn");
        pickUpAllBtn.textContent = `รับทั้งหมด (${allCenterTickets.length})`;
        pickUpAllBtn.disabled = !canPickUp || allCenterTickets.length === 0;

        const tbody = document.getElementById("centerQueueList");
        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">ไม่มีงานในถังกลาง</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(ticket => {
            const meta = store.getShiftMeta(ticket);
            const branchDisplay = store.getBranchDisplay(ticket.branchId, ticket.branchName);
            const reasonDisplay = store.getReasonDisplay(ticket.pendingReasonId, ticket.pendingReasonLabel);
            return `
                <tr>
                    <td><span class="ticket-id">${store.escapeHtml(ticket.id)}</span></td>
                    <td><span class="branch-tag">${store.escapeHtml(branchDisplay)}</span></td>
                    <td>${store.escapeHtml(ticket.detail)}</td>
                    <td>${store.escapeHtml(ticket.lastFromLabel || "-")}</td>
                    <td>
                        <span class="reason-pill">${store.escapeHtml(reasonDisplay)}</span>
                        <span class="sub-meta">${store.escapeHtml(ticket.pendingNote || "-")}</span>
                    </td>
                    <td>${store.renderAgingBadgeHtml(meta.missedShifts)}</td>
                    <td>
                        <div class="action-group">
                            <button type="button" class="btn btn-primary btn-sm" data-action="pickup" data-id="${store.escapeHtml(ticket.id)}" ${canPickUp ? "" : "disabled"}>
                                รับงาน
                            </button>
                            <button type="button" class="btn btn-outline btn-sm" data-action="timeline" data-id="${store.escapeHtml(ticket.id)}">
                                ประวัติ
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }

    function bindEvents() {
        document.getElementById("centerQuickStartShiftBtn").addEventListener("click", ShiftApp.actions.startShift);
        document.getElementById("pickUpAllBtn").addEventListener("click", ShiftApp.actions.pickUpAllTickets);
        document.getElementById("centerFilterBranch").addEventListener("change", render);
        document.getElementById("centerFilterReason").addEventListener("change", render);
    }

    ShiftApp.views.center = { render, bindEvents };
})();
