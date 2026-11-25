(() => {
    const ShiftApp = window.ShiftApp;
    const { SHIFT_CONFIG, STATUS_META } = ShiftApp.config;
    const store = ShiftApp.store;

    function render() {
        const state = store.getState();
        const branchSelect = document.getElementById("dashFilterBranch");
        const reasonSelect = document.getElementById("dashFilterReason");
        const statusSelect = document.getElementById("dashFilterStatus");

        store.populateSelectWithOptions(
            branchSelect,
            "ทุกสาขา",
            state.branches.map(b => ({ value: b.id, label: `${b.code} ${b.name}` })),
            branchSelect.value
        );

        const reasonFilterOptions = [
            ...state.reasons.map(r => ({ value: r.id, label: r.label })),
            { value: "__DEV__", label: "รอ Dev" },
            { value: "__SHIFT__", label: "ทำในกะ" }
        ];
        store.populateSelectWithOptions(
            reasonSelect,
            "ทุกสาเหตุ",
            reasonFilterOptions,
            reasonSelect.value
        );

        const openStatusOptions = ["IN_PROGRESS", "IN_CENTER", "DEV_QUEUE", "DEV_PROGRESS"].map(key => ({
            value: key,
            label: STATUS_META[key].label
        }));
        store.populateSelectWithOptions(statusSelect, "ทุกสถานะค้าง", openStatusOptions, statusSelect.value);

        const totalCount = state.tickets.length;
        const openTickets = state.tickets.filter(t => t.status !== "CLOSED");
        const centerCount = state.tickets.filter(t => t.status === "IN_CENTER").length;
        const devCount = state.tickets.filter(t => t.status === "DEV_QUEUE" || t.status === "DEV_PROGRESS").length;
        const closedCount = state.tickets.filter(t => t.status === "CLOSED").length;
        const chronicCount = openTickets.filter(t => store.getShiftMeta(t).missedShifts >= 2).length;
        const closedPct = totalCount > 0 ? Math.round((closedCount / totalCount) * 100) : 0;

        document.getElementById("dashTotalCount").textContent = totalCount;
        document.getElementById("dashOpenTotalCount").textContent = openTickets.length;
        document.getElementById("dashCenterCount").textContent = centerCount;
        document.getElementById("dashDevCount").textContent = devCount;
        document.getElementById("dashClosedCount").textContent = closedCount;
        document.getElementById("dashClosedRate").textContent = `${closedPct}%`;
        document.getElementById("dashChronicCount").textContent = chronicCount;

        const branchStats = state.branches.map(b => {
            const ofBranch = state.tickets.filter(t => t.branchId === b.id);
            const open = ofBranch.filter(t => t.status !== "CLOSED");
            return {
                id: b.id,
                label: `${b.code} ${b.name}${b.active ? "" : " (ปิด)"}`,
                openCount: open.length,
                inShift: open.filter(t => t.status === "IN_PROGRESS").length,
                inCenter: open.filter(t => t.status === "IN_CENTER").length,
                inDev: open.filter(t => t.status === "DEV_QUEUE" || t.status === "DEV_PROGRESS").length,
                closed: ofBranch.filter(t => t.status === "CLOSED").length
            };
        }).sort((a, b) => b.openCount - a.openCount);

        const maxBranchOpen = Math.max(1, ...branchStats.map(b => b.openCount));
        document.getElementById("dashByBranch").innerHTML = branchStats.map(b => {
            const pct = Math.round((b.openCount / maxBranchOpen) * 100);
            const selected = branchSelect.value === b.id ? "selected" : "";
            return `
                <div class="analytics-row ${selected}" data-dash-branch="${store.escapeHtml(b.id)}">
                    <div class="analytics-row-head">
                        <span class="analytics-row-title">${store.escapeHtml(b.label)}</span>
                        <span class="analytics-row-count">ค้าง ${b.openCount}</span>
                    </div>
                    <div class="bar-track">
                        <div class="bar-fill" style="width:${pct}%"></div>
                    </div>
                    <div class="analytics-breakdown">
                        <span>กะ <strong>${b.inShift}</strong></span>
                        <span>•</span>
                        <span>กลาง <strong>${b.inCenter}</strong></span>
                        <span>•</span>
                        <span>Dev <strong>${b.inDev}</strong></span>
                        <span>•</span>
                        <span>ปิด <strong>${b.closed}</strong></span>
                    </div>
                </div>
            `;
        }).join("");

        const reasonBuckets = new Map();
        state.reasons.forEach(r => {
            reasonBuckets.set(r.id, { id: r.id, label: r.label, count: 0 });
        });
        reasonBuckets.set("__DEV__", { id: "__DEV__", label: "รอ Dev", count: 0 });
        reasonBuckets.set("__SHIFT__", { id: "__SHIFT__", label: "ทำในกะ", count: 0 });

        openTickets.forEach(t => {
            if (t.status === "DEV_QUEUE" || t.status === "DEV_PROGRESS") {
                reasonBuckets.get("__DEV__").count += 1;
            } else if (t.status === "IN_CENTER") {
                const key = t.pendingReasonId || "__SHIFT__";
                if (!reasonBuckets.has(key)) {
                    reasonBuckets.set(key, {
                        id: key,
                        label: store.getReasonDisplay(t.pendingReasonId, t.pendingReasonLabel),
                        count: 0
                    });
                }
                reasonBuckets.get(key).count += 1;
            } else {
                reasonBuckets.get("__SHIFT__").count += 1;
            }
        });

        const reasonList = Array.from(reasonBuckets.values()).sort((a, b) => b.count - a.count);
        const maxReasonCount = Math.max(1, ...reasonList.map(r => r.count));
        document.getElementById("dashByReason").innerHTML = reasonList.map(r => {
            const barPct = Math.round((r.count / maxReasonCount) * 100);
            const sharePct = openTickets.length > 0 ? Math.round((r.count / openTickets.length) * 100) : 0;
            const selected = reasonSelect.value === r.id ? "selected" : "";
            return `
                <div class="analytics-row ${selected}" data-dash-reason="${store.escapeHtml(r.id)}">
                    <div class="analytics-row-head">
                        <span class="analytics-row-title">${store.escapeHtml(r.label)}</span>
                        <span class="analytics-row-count" style="color:var(--warning);">${r.count} (${sharePct}%)</span>
                    </div>
                    <div class="bar-track">
                        <div class="bar-fill reason-fill" style="width:${barPct}%"></div>
                    </div>
                </div>
            `;
        }).join("");

        const filteredBacklog = openTickets.filter(t => {
            if (branchSelect.value && t.branchId !== branchSelect.value) return false;
            if (statusSelect.value && t.status !== statusSelect.value) return false;
            if (reasonSelect.value) {
                if (reasonSelect.value === "__DEV__") {
                    if (t.status !== "DEV_QUEUE" && t.status !== "DEV_PROGRESS") return false;
                } else if (reasonSelect.value === "__SHIFT__") {
                    if (t.status !== "IN_PROGRESS") return false;
                } else if (t.pendingReasonId !== reasonSelect.value) {
                    return false;
                }
            }
            return true;
        }).sort((a, b) => store.getShiftMeta(b).missedShifts - store.getShiftMeta(a).missedShifts);

        const filterHints = [];
        if (branchSelect.value) filterHints.push(store.getBranchDisplay(branchSelect.value));
        if (reasonSelect.value) {
            const rOpt = reasonFilterOptions.find(o => o.value === reasonSelect.value);
            if (rOpt) filterHints.push(rOpt.label);
        }
        if (statusSelect.value) filterHints.push(STATUS_META[statusSelect.value]?.label || statusSelect.value);

        document.getElementById("dashActiveFilterLabel").textContent = filterHints.length > 0
            ? `กรอง: ${filterHints.join(" • ")} (${filteredBacklog.length})`
            : `${filteredBacklog.length} งาน`;

        const tbody = document.getElementById("dashBacklogList");
        if (filteredBacklog.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">ไม่พบงานค้าง</td></tr>`;
            return;
        }

        tbody.innerHTML = filteredBacklog.map(t => {
            const meta = store.getShiftMeta(t);
            const branchDisplay = store.getBranchDisplay(t.branchId, t.branchName);
            let holder = "-";
            if (t.status === "IN_PROGRESS") {
                holder = `${SHIFT_CONFIG[t.currentShift]?.label || t.currentShift} (${t.currentOwnerName || "-"})`;
            } else if (t.status === "IN_CENTER") {
                holder = `ถังกลาง (จาก ${t.lastFromLabel || "-"})`;
            } else if (t.status === "DEV_QUEUE") {
                holder = `รอ Dev (จาก ${t.lastFromLabel || "-"})`;
            } else if (t.status === "DEV_PROGRESS") {
                holder = `ทีม Dev (${t.currentOwnerName || "-"})`;
            }

            const reasonBadge = t.status === "IN_CENTER"
                ? `<span class="reason-pill">${store.escapeHtml(store.getReasonDisplay(t.pendingReasonId, t.pendingReasonLabel))}</span>`
                : (t.status === "DEV_QUEUE" || t.status === "DEV_PROGRESS"
                    ? `<span class="reason-pill" style="background:var(--purple-soft); color:#5b21b6;">รอ Dev</span>`
                    : `<span class="muted">ทำในกะ</span>`);

            return `
                <tr>
                    <td><span class="ticket-id">${store.escapeHtml(t.id)}</span></td>
                    <td><span class="branch-tag">${store.escapeHtml(branchDisplay)}</span></td>
                    <td>${store.escapeHtml(t.detail)}</td>
                    <td>${store.renderStatusBadgeHtml(t.status)}</td>
                    <td>${store.escapeHtml(holder)}</td>
                    <td>
                        ${reasonBadge}
                        ${t.pendingNote ? `<span class="sub-meta">${store.escapeHtml(t.pendingNote)}</span>` : ""}
                    </td>
                    <td>${store.renderAgingBadgeHtml(meta.missedShifts)}</td>
                    <td>
                        <button type="button" class="btn btn-outline btn-sm" data-action="timeline" data-id="${store.escapeHtml(t.id)}">
                            ประวัติ
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    }

    function bindEvents() {
        document.getElementById("dashFilterBranch").addEventListener("change", render);
        document.getElementById("dashFilterReason").addEventListener("change", render);
        document.getElementById("dashFilterStatus").addEventListener("change", render);
        document.getElementById("dashResetFilterBtn").addEventListener("click", () => {
            document.getElementById("dashFilterBranch").value = "";
            document.getElementById("dashFilterReason").value = "";
            document.getElementById("dashFilterStatus").value = "";
            render();
        });

        document.getElementById("dashByBranch").addEventListener("click", e => {
            const row = e.target.closest("[data-dash-branch]");
            if (!row) return;
            const branchId = row.getAttribute("data-dash-branch");
            const select = document.getElementById("dashFilterBranch");
            select.value = select.value === branchId ? "" : branchId;
            render();
        });

        document.getElementById("dashByReason").addEventListener("click", e => {
            const row = e.target.closest("[data-dash-reason]");
            if (!row) return;
            const reasonId = row.getAttribute("data-dash-reason");
            const select = document.getElementById("dashFilterReason");
            select.value = select.value === reasonId ? "" : reasonId;
            render();
        });
    }

    ShiftApp.views.dashboard = { render, bindEvents };
})();
