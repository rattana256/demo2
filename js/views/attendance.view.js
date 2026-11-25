(() => {
    const ShiftApp = window.ShiftApp;
    const { SHIFT_CONFIG, ROLE_CONFIG } = ShiftApp.config;
    const store = ShiftApp.store;

    function getShiftRoleDisplay(log) {
        if (log.role === "shift") {
            const sc = SHIFT_CONFIG[log.shift];
            return sc ? `${sc.label} (${sc.hours})` : `กะ ${log.shift || "-"}`;
        }
        if (log.role === "dev") {
            return `ทีม Dev (${ROLE_CONFIG.dev.hours})`;
        }
        return ROLE_CONFIG.admin.label;
    }

    function getPunctualityClass(status) {
        if (status === "normal") return "att-normal";
        if (status === "late") return "att-late";
        if (status === "very_late") return "att-very-late";
        if (status === "too_early") return "att-too-early";
        return "att-neutral";
    }

    function render() {
        const state = store.getState();
        const timeInfo = store.getCurrentTimeInfo();

        const clockStatusEl = document.getElementById("attClockStatusText");
        const hourInputEl = document.getElementById("attClockHour");
        const minInputEl = document.getElementById("attClockMinute");
        const realBtnEl = document.getElementById("attUseRealClockBtn");
        const pad = n => String(n).padStart(2, "0");
        if (clockStatusEl) {
            clockStatusEl.textContent = timeInfo.isMock
                ? `เวลาจำลอง`
                : `เวลาจริง`;
            clockStatusEl.classList.toggle("is-mock", timeInfo.isMock);
        }
        if (hourInputEl && document.activeElement !== hourInputEl) {
            hourInputEl.value = pad(timeInfo.hours);
        }
        if (minInputEl && document.activeElement !== minInputEl) {
            minInputEl.value = pad(timeInfo.minutes);
        }
        if (realBtnEl) {
            realBtnEl.classList.toggle("hidden", !timeInfo.isMock);
        }

        document.querySelectorAll("#attClockPresets [data-clock-preset]").forEach(btn => {
            const preset = btn.getAttribute("data-clock-preset");
            btn.classList.toggle("active", timeInfo.isMock && timeInfo.hhmm === preset);
        });

        const shiftFilter = document.getElementById("attendanceFilterShift").value;
        const statusFilter = document.getElementById("attendanceFilterStatus").value;
        const search = document.getElementById("attendanceSearch").value.trim().toLowerCase();

        const logs = Array.isArray(state.authLogs) ? state.authLogs : [];
        const filtered = logs.filter(log => {
            if (shiftFilter === "A" || shiftFilter === "B" || shiftFilter === "C") {
                if (log.role !== "shift" || log.shift !== shiftFilter) return false;
            } else if (shiftFilter === "dev") {
                if (log.role !== "dev") return false;
            } else if (shiftFilter === "admin") {
                if (log.role !== "admin") return false;
            }

            if (statusFilter === "normal") {
                if (log.punctuality !== "normal") return false;
            } else if (statusFilter === "late") {
                if (log.punctuality !== "late") return false;
            } else if (statusFilter === "very_late") {
                if (log.punctuality !== "very_late") return false;
            } else if (statusFilter === "too_early") {
                if (log.punctuality !== "too_early") return false;
            } else if (statusFilter === "online") {
                if (log.logoutAt) return false;
            } else if (statusFilter === "logged_out") {
                if (!log.logoutAt) return false;
            }

            if (search) {
                const roleLabel = getShiftRoleDisplay(log);
                const haystack = [
                    log.userName,
                    log.employeeCode,
                    roleLabel,
                    log.punctualityLabel
                ].join(" ").toLowerCase();
                if (!haystack.includes(search)) return false;
            }

            return true;
        });

        const onlineCount = filtered.filter(l => !l.logoutAt).length;
        const normalCount = filtered.filter(l => l.punctuality === "normal").length;
        const lateCount = filtered.filter(l => l.punctuality === "late").length;
        const veryLateCount = filtered.filter(l => l.punctuality === "very_late").length;

        document.getElementById("attTotalCount").textContent = filtered.length;
        document.getElementById("attOnlineCount").textContent = onlineCount;
        document.getElementById("attNormalCount").textContent = normalCount;
        document.getElementById("attLateCount").textContent = lateCount;
        document.getElementById("attVeryLateCount").textContent = veryLateCount;

        const tbody = document.getElementById("attendanceLogList");
        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">ไม่พบประวัติเข้า-ออกระบบตามเงื่อนไขที่เลือก</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map((log, idx) => {
            const roleDisplay = getShiftRoleDisplay(log);
            const logoutHtml = log.logoutAt
                ? store.escapeHtml(log.logoutAt)
                : `<span class="att-badge att-online">กำลังใช้งานอยู่</span>`;
            const durationText = store.formatDurationThai(log.durationMinutes);
            const punctualityCls = getPunctualityClass(log.punctuality);

            return `
                <tr>
                    <td>${idx + 1}</td>
                    <td><span class="ticket-id">${store.escapeHtml(log.employeeCode || "-")}</span></td>
                    <td><strong>${store.escapeHtml(log.userName || "-")}</strong></td>
                    <td>${store.escapeHtml(roleDisplay)}</td>
                    <td>${store.escapeHtml(log.loginAt || "-")}</td>
                    <td>${logoutHtml}</td>
                    <td>${store.escapeHtml(durationText)}</td>
                    <td><span class="att-badge ${punctualityCls}">${store.escapeHtml(log.punctualityLabel || "ปกติ")}</span></td>
                </tr>
            `;
        }).join("");
    }

    function bindEvents() {
        document.getElementById("attendanceFilterShift").addEventListener("change", render);
        document.getElementById("attendanceFilterStatus").addEventListener("change", render);
        document.getElementById("attendanceSearch").addEventListener("input", render);

        document.getElementById("attTimeStepper").addEventListener("click", e => {
            const btn = e.target.closest("[data-step-unit]");
            if (!btn) return;
            const unit = btn.getAttribute("data-step-unit");
            const dir = Number(btn.getAttribute("data-step-dir")) || 0;
            ShiftApp.actions.stepMockClock(unit, dir);
        });

        const applyAttInputs = () => {
            const h = document.getElementById("attClockHour").value;
            const m = document.getElementById("attClockMinute").value;
            ShiftApp.actions.setMockClockHm(h, m);
        };
        document.getElementById("attClockHour").addEventListener("change", applyAttInputs);
        document.getElementById("attClockMinute").addEventListener("change", applyAttInputs);

        document.getElementById("attClockPresets").addEventListener("click", e => {
            const btn = e.target.closest("[data-clock-preset]");
            if (!btn) return;
            ShiftApp.actions.setMockClockTime(btn.getAttribute("data-clock-preset"));
        });

        document.getElementById("attUseRealClockBtn").addEventListener("click", () => {
            ShiftApp.actions.useRealClock();
        });
    }

    ShiftApp.views.attendance = { render, bindEvents };
})();
