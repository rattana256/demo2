(() => {
    const ShiftApp = window.ShiftApp;
    const { SHIFT_CONFIG } = ShiftApp.config;
    const store = ShiftApp.store;

    function render() {
        const state = store.getState();
        const groupFilter = document.getElementById("staffBoardGroupFilter").value;
        const taskStatusFilter = document.getElementById("staffBoardTaskStatusFilter").value;
        const search = document.getElementById("staffBoardSearch").value.trim().toLowerCase();

        const staffUsers = state.users.filter(u => {
            if (!u.active || u.role !== "shift") return false;
            if (groupFilter === "active-shift") return Boolean(state.shiftOnDuty[u.shift]);
            if (groupFilter === "A" || groupFilter === "B" || groupFilter === "C") {
                return u.shift === groupFilter;
            }
            return Boolean(state.shiftOnDuty[u.shift]);
        });

        const prepared = staffUsers.map(u => {
            const profile = store.getUserProfile(u);
            const summary = store.getUserTicketsSummary(u);

            const filteredTickets = summary.tickets.filter(item => {
                if (taskStatusFilter === "open") return item.ticket.status !== "CLOSED";
                if (taskStatusFilter === "closed") return item.ticket.status === "CLOSED";
                return true;
            });

            return { user: u, profile, summary, filteredTickets };
        }).filter(entry => {
            if (!search) return true;
            const ticketHaystack = entry.summary.tickets.map(item =>
                `${item.ticket.id} ${item.ticket.detail} ${store.getBranchDisplay(item.ticket.branchId, item.ticket.branchName)}`
            ).join(" ");
            const haystack = [
                entry.user.name,
                entry.user.username,
                entry.profile.employeeCode,
                entry.profile.position,
                ticketHaystack
            ].join(" ").toLowerCase();
            return haystack.includes(search);
        });

        const onDutyCount = prepared.filter(e => e.profile.isOnDuty).length;
        const activeTicketsTotal = prepared.reduce((acc, e) => acc + e.summary.activeCount, 0);
        const closedTicketsTotal = prepared.reduce((acc, e) => acc + e.summary.closedCount, 0);

        document.getElementById("staffBoardTotalStaff").textContent = prepared.length;
        document.getElementById("staffBoardOnDutyCount").textContent = onDutyCount;
        document.getElementById("staffBoardActiveTasksCount").textContent = activeTicketsTotal;
        document.getElementById("staffBoardClosedTasksCount").textContent = closedTicketsTotal;

        const grid = document.getElementById("staffBoardGrid");
        grid.classList.toggle("single-card", prepared.length === 1);

        if (prepared.length === 0) {
            const emptyMsg = groupFilter === "active-shift" && !search
                ? "ยังไม่มีกะที่เริ่มปฏิบัติงาน — กด 'เริ่มกะ' หรือเลือกดูกะด้านบน"
                : "ไม่พบช่างตามเงื่อนไข";
            grid.innerHTML = `<div class="panel empty-cell">${emptyMsg}</div>`;
            return;
        }

        grid.innerHTML = prepared.map(entry => {
            const { user, profile, summary, filteredTickets } = entry;
            const completionPct = summary.total > 0 ? Math.round((summary.closedCount / summary.total) * 100) : 0;
            const dutyClass = profile.isOnDuty ? "on-duty" : "off-duty";
            const shiftHours = SHIFT_CONFIG[user.shift]?.hours || "";

            let taskRowsHtml = "";
            if (!profile.isOnDuty) {
                taskRowsHtml = `<div class="staff-task-empty">ยังไม่เริ่มกะ — งานค้างอยู่ในถังกลาง</div>`;
            } else if (filteredTickets.length === 0) {
                taskRowsHtml = `<div class="staff-task-empty">ไม่มีรายการงานในกะนี้</div>`;
            } else {
                taskRowsHtml = filteredTickets.map(item => {
                    const t = item.ticket;
                    const branchDisplay = store.getBranchDisplay(t.branchId, t.branchName);
                    let subNote = "";
                    if (t.status === "CLOSED") {
                        subNote = `ปิดเมื่อ ${t.closedAt || "-"}`;
                    } else if (t.status === "IN_CENTER") {
                        subNote = `เหตุผล: ${store.getReasonDisplay(t.pendingReasonId, t.pendingReasonLabel)}`;
                    } else if (t.status === "DEV_QUEUE" || t.status === "DEV_PROGRESS") {
                        subNote = t.pendingNote || "ส่งทีม Dev";
                    }

                    return `
                        <div class="staff-task-row">
                            <div class="staff-task-left">
                                <div class="staff-task-title-line">
                                    <span class="ticket-id">${store.escapeHtml(t.id)}</span>
                                    <span class="branch-tag">${store.escapeHtml(branchDisplay)}</span>
                                    <span class="staff-task-title">${store.escapeHtml(t.detail)}</span>
                                </div>
                                ${subNote ? `<div class="staff-task-sub">${store.escapeHtml(subNote)}</div>` : ""}
                            </div>
                            <div class="staff-task-right">
                                ${store.renderStatusBadgeHtml(t.status)}
                                <button type="button" class="btn btn-outline btn-sm" data-action="timeline" data-id="${store.escapeHtml(t.id)}">
                                    ประวัติ
                                </button>
                            </div>
                        </div>
                    `;
                }).join("");
            }

            return `
                <article class="panel staff-card" data-staff-id="${store.escapeHtml(user.id)}">
                    <div class="staff-card-header">
                        <div class="staff-avatar" style="background:${store.escapeHtml(profile.avatarColor)};">
                            ${store.escapeHtml(profile.initials)}
                        </div>
                        <div class="staff-profile-info">
                            <div class="staff-name-row">
                                <h3>${store.escapeHtml(user.name)}</h3>
                                <span class="duty-badge ${dutyClass}">${store.escapeHtml(profile.dutyLabel)}</span>
                            </div>
                            <div class="staff-profile-meta">
                                <span><strong>${store.escapeHtml(profile.employeeCode)}</strong></span>
                                <span>•</span>
                                <span>${store.escapeHtml(profile.position)}</span>
                                <span>•</span>
                                <span>${store.escapeHtml(shiftHours)}</span>
                            </div>
                        </div>
                    </div>

                    <div class="staff-stats-grid">
                        <div class="staff-stat-box">
                            <span class="staff-stat-num">${summary.total}</span>
                            <span class="staff-stat-label">ทั้งหมด</span>
                        </div>
                        <div class="staff-stat-box stat-active">
                            <span class="staff-stat-num">${summary.activeCount}</span>
                            <span class="staff-stat-label">กำลังทำ</span>
                        </div>
                        <div class="staff-stat-box stat-closed">
                            <span class="staff-stat-num">${summary.closedCount}</span>
                            <span class="staff-stat-label">เสร็จแล้ว</span>
                        </div>
                        <div class="staff-stat-box stat-handover">
                            <span class="staff-stat-num">${summary.handedOverCount}</span>
                            <span class="staff-stat-label">ส่งต่อ</span>
                        </div>
                    </div>

                    <div class="staff-progress-wrap">
                        <div class="staff-progress-label">
                            <span>ปิดงานแล้ว</span>
                            <strong>${summary.closedCount}/${summary.total} (${completionPct}%)</strong>
                        </div>
                        <div class="staff-progress-track">
                            <div class="staff-progress-fill" style="width:${completionPct}%"></div>
                        </div>
                    </div>

                    <div class="staff-task-section">
                        <div class="staff-task-section-head">
                            <strong>รายการงาน (${filteredTickets.length})</strong>
                            <span class="muted">สถานะ</span>
                        </div>
                        <div class="staff-task-list">
                            ${taskRowsHtml}
                        </div>
                    </div>
                </article>
            `;
        }).join("");
    }

    function bindEvents() {
        document.getElementById("staffBoardGroupFilter").addEventListener("change", render);
        document.getElementById("staffBoardTaskStatusFilter").addEventListener("change", render);
        document.getElementById("staffBoardSearch").addEventListener("input", render);
    }

    ShiftApp.views.staffBoard = { render, bindEvents };
})();
