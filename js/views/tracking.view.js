(() => {
    const ShiftApp = window.ShiftApp;
    const { SHIFT_CONFIG, STATUS_META, EVENT_DOT_CLASS } = ShiftApp.config;
    const store = ShiftApp.store;

    function buildTimelineContentHtml(ticket) {
        const meta = store.getShiftMeta(ticket);
        const branchDisplay = store.getBranchDisplay(ticket.branchId, ticket.branchName);
        const createdShiftLabel = ticket.createdShift ? SHIFT_CONFIG[ticket.createdShift].label : "-";
        const waitingClass = ticket.status === "CLOSED" ? "fact-box fact-closed" : "fact-box fact-highlight";

        const chipsHtml = meta.contributors.map(name =>
            `<span class="handover-chip">${store.escapeHtml(name)}</span>`
        ).join("");

        const eventsHtml = (ticket.timeline || []).map(ev => {
            const dotClass = EVENT_DOT_CLASS[ev.type] || "ev-created";
            const reasonLine = ev.reasonLabel
                ? `<div style="margin-top:4px;"><span class="reason-pill">${store.escapeHtml(ev.reasonLabel)}</span></div>`
                : "";
            return `
                <div class="timeline-entry">
                    <span class="timeline-dot ${dotClass}"></span>
                    <div class="timeline-entry-head">
                        <span class="timeline-entry-title">${store.escapeHtml(ev.title)}</span>
                        <span class="timeline-entry-time">${store.escapeHtml(ev.at)}</span>
                    </div>
                    <div class="timeline-entry-actor">
                        <strong>${store.escapeHtml(ev.actorName)}</strong> • ${store.escapeHtml(ev.actorRole || "-")}
                    </div>
                    ${reasonLine}
                    ${ev.note ? `<div class="timeline-entry-note">${store.escapeHtml(ev.note)}</div>` : ""}
                </div>
            `;
        }).join("");

        return `
            <div class="timeline-header">
                <div>
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
                        <span class="ticket-id" style="font-size:16px;">${store.escapeHtml(ticket.id)}</span>
                        <span class="branch-tag">${store.escapeHtml(branchDisplay)}</span>
                        ${store.renderStatusBadgeHtml(ticket.status)}
                        ${store.renderAgingBadgeHtml(meta.missedShifts)}
                    </div>
                    <div style="font-size:15px; font-weight:700;">${store.escapeHtml(ticket.detail)}</div>
                </div>
            </div>

            <div class="timeline-facts-grid">
                <div class="fact-box">
                    <div class="fact-label">เปิดงาน</div>
                    <div class="fact-value">${store.escapeHtml(ticket.createdAt)}</div>
                    <div class="fact-sub">${store.escapeHtml(ticket.createdByName)} (${store.escapeHtml(createdShiftLabel)})</div>
                </div>

                <div class="fact-box">
                    <div class="fact-label">ค้างมาแล้ว</div>
                    <div class="fact-value">${meta.missedShifts} กะ</div>
                    <div class="fact-sub">${store.escapeHtml(meta.shiftPath)}</div>
                </div>

                <div class="fact-box">
                    <div class="fact-label">ผ่านมือ (${meta.contributors.length})</div>
                    <div class="handover-chips">${chipsHtml || "-"}</div>
                </div>

                <div class="${waitingClass}">
                    <div class="fact-label">สถานะ / รออะไร</div>
                    <div class="fact-value">${store.escapeHtml(STATUS_META[ticket.status]?.label || ticket.status)}</div>
                    <div class="fact-sub">${store.escapeHtml(meta.waitingSummary)}</div>
                </div>
            </div>

            <h3 style="margin-bottom:10px;">Timeline (${(ticket.timeline || []).length})</h3>
            <div class="timeline-list">
                ${eventsHtml}
            </div>
        `;
    }

    function render() {
        const state = store.getState();
        const branchSelect = document.getElementById("trackingFilterBranch");
        const statusSelect = document.getElementById("trackingFilterStatus");

        store.populateSelectWithOptions(
            branchSelect,
            "ทุกสาขา",
            state.branches.map(b => ({ value: b.id, label: `${b.code} ${b.name}` })),
            branchSelect.value
        );
        store.populateSelectWithOptions(
            statusSelect,
            "ทุกสถานะ",
            Object.keys(STATUS_META).map(key => ({ value: key, label: STATUS_META[key].label })),
            statusSelect.value
        );

        const search = document.getElementById("trackingSearch").value.trim().toLowerCase();
        const filtered = state.tickets.filter(t => {
            if (branchSelect.value && t.branchId !== branchSelect.value) return false;
            if (statusSelect.value && t.status !== statusSelect.value) return false;
            if (search) {
                const meta = store.getShiftMeta(t);
                const haystack = [
                    t.id,
                    t.detail,
                    store.getBranchDisplay(t.branchId, t.branchName),
                    t.createdByName,
                    t.currentOwnerName,
                    t.closedByName,
                    t.pendingReasonLabel,
                    t.pendingNote,
                    meta.contributors.join(" ")
                ].join(" ").toLowerCase();
                if (!haystack.includes(search)) return false;
            }
            return true;
        });

        document.getElementById("trackingResultCount").textContent = filtered.length;
        const listContainer = document.getElementById("trackingTicketList");
        const detailPanel = document.getElementById("trackingTimelinePanel");

        if (filtered.length === 0) {
            listContainer.innerHTML = `<div class="empty-cell">ไม่พบใบงาน</div>`;
            detailPanel.innerHTML = `<div class="empty-cell">เลือกใบงานเพื่อดู Timeline</div>`;
            return;
        }

        if (!filtered.some(t => t.id === state.selectedTrackingId)) {
            state.selectedTrackingId = filtered[0].id;
        }

        listContainer.innerHTML = filtered.map(ticket => {
            const meta = store.getShiftMeta(ticket);
            const isSelected = ticket.id === state.selectedTrackingId;
            return `
                <button type="button" class="tracking-item ${isSelected ? "selected" : ""}" data-track-id="${store.escapeHtml(ticket.id)}">
                    <div class="tracking-item-top">
                        <span class="ticket-id">${store.escapeHtml(ticket.id)}</span>
                        ${store.renderStatusBadgeHtml(ticket.status)}
                    </div>
                    <div class="tracking-item-detail">${store.escapeHtml(ticket.detail)}</div>
                    <div class="tracking-item-meta">
                        <span>${store.escapeHtml(store.getBranchDisplay(ticket.branchId, ticket.branchName))}</span>
                        ${store.renderAgingBadgeHtml(meta.missedShifts)}
                    </div>
                </button>
            `;
        }).join("");

        const selectedTicket = filtered.find(t => t.id === state.selectedTrackingId) || filtered[0];
        detailPanel.innerHTML = buildTimelineContentHtml(selectedTicket);
    }

    function bindEvents() {
        document.getElementById("trackingSearch").addEventListener("input", render);
        document.getElementById("trackingFilterBranch").addEventListener("change", render);
        document.getElementById("trackingFilterStatus").addEventListener("change", render);
        document.getElementById("trackingTicketList").addEventListener("click", e => {
            const item = e.target.closest(".tracking-item");
            if (!item) return;
            const state = store.getState();
            state.selectedTrackingId = item.getAttribute("data-track-id");
            render();
            store.saveState();
        });
    }

    ShiftApp.views.tracking = { buildTimelineContentHtml, render, bindEvents };
})();
