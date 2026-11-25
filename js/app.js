(() => {
    const ShiftApp = window.ShiftApp;
    const { SHIFT_CONFIG, ROLE_CONFIG, ROLE_VIEWS } = ShiftApp.config;
    const store = ShiftApp.store;

    function renderHeaderAndNav() {
        const state = store.getState();
        const user = store.getCurrentUser();
        const timeInfo = store.getCurrentTimeInfo();
        const isFree = state.demoAccessMode === "free";
        const pad = n => String(n).padStart(2, "0");

        const headerTimeControl = document.getElementById("headerTimeControl");
        const headerClockHour = document.getElementById("headerClockHour");
        const headerClockMinute = document.getElementById("headerClockMinute");
        const headerUseRealBtn = document.getElementById("headerUseRealClockBtn");
        if (headerTimeControl) {
            headerTimeControl.classList.toggle("hidden", isFree);
        }
        if (headerClockHour && document.activeElement !== headerClockHour) {
            headerClockHour.value = pad(timeInfo.hours);
        }
        if (headerClockMinute && document.activeElement !== headerClockMinute) {
            headerClockMinute.value = pad(timeInfo.minutes);
        }
        if (headerUseRealBtn) {
            headerUseRealBtn.classList.toggle("hidden", !timeInfo.isMock);
        }

        const switcher = document.getElementById("userSwitcher");
        const roleGroups = [
            { role: "shift", label: "พนักงานกะ" },
            { role: "dev", label: "ทีม Dev" },
            { role: "admin", label: "Admin" }
        ];

        switcher.innerHTML = roleGroups.map(group => {
            const usersInRole = state.users.filter(u => u.role === group.role && u.active);
            if (usersInRole.length === 0) return "";
            const options = usersInRole.map(u => {
                const extra = u.role === "shift" ? ` (${SHIFT_CONFIG[u.shift].label})` : "";
                const access = store.checkShiftLoginAccess(u, timeInfo.hhmm);
                const isBlocked = !access.allowed && u.id !== user.id;
                const lockText = isBlocked ? " — นอกเวลา" : "";
                const disAttr = isBlocked ? "disabled" : "";
                const sel = u.id === user.id ? "selected" : "";
                return `<option value="${store.escapeHtml(u.id)}" ${sel} ${disAttr}>${store.escapeHtml(u.name)}${store.escapeHtml(extra)}${lockText}</option>`;
            }).join("");
            return `<optgroup label="${store.escapeHtml(group.label)}">${options}</optgroup>`;
        }).join("");

        const roleBadge = document.getElementById("currentRoleBadge");
        roleBadge.className = `role-badge ${ROLE_CONFIG[user.role].badgeClass}`;
        roleBadge.textContent = store.getUserRoleLabel(user);

        const modeBtn = document.getElementById("headerAccessModeBtn");
        if (modeBtn) {
            modeBtn.textContent = isFree ? "อิสระทุกกะ" : "ตรวจเวลากะ";
            modeBtn.classList.toggle("btn-mode-free", isFree);
        }

        const centerCount = state.tickets.filter(t => t.status === "IN_CENTER").length;
        const devCount = state.tickets.filter(t => t.status === "DEV_QUEUE" || t.status === "DEV_PROGRESS").length;

        const navCenterBadge = document.getElementById("navCenterCount");
        navCenterBadge.textContent = centerCount;
        navCenterBadge.classList.toggle("is-zero", centerCount === 0);

        const navDevBadge = document.getElementById("navDevCount");
        navDevBadge.textContent = devCount;
        navDevBadge.classList.toggle("is-zero", devCount === 0);

        const allowedViews = ROLE_VIEWS[user.role] || [];
        if (!allowedViews.includes(state.activeView)) {
            state.activeView = ROLE_CONFIG[user.role].defaultView;
        }

        document.querySelectorAll("#mainNav .nav-tab").forEach(tab => {
            const viewId = tab.getAttribute("data-view");
            const isAllowed = allowedViews.includes(viewId);
            tab.classList.toggle("hidden", !isAllowed);
            tab.classList.toggle("active", isAllowed && state.activeView === viewId);
        });

        document.querySelectorAll("main .view").forEach(section => {
            const isCurrent = section.getAttribute("data-view") === state.activeView;
            section.classList.toggle("hidden", !isCurrent);
        });
    }

    function renderAll() {
        const state = store.getState();
        ShiftApp.views.auth.render();
        if (!state.isAuthenticated) {
            store.saveState();
            return;
        }
        renderHeaderAndNav();
        if (state.activeView === "view-shift") ShiftApp.views.shift.render();
        if (state.activeView === "view-center") ShiftApp.views.center.render();
        if (state.activeView === "view-dev") ShiftApp.views.dev.render();
        if (state.activeView === "view-staff-board") ShiftApp.views.staffBoard.render();
        if (state.activeView === "view-tracking") ShiftApp.views.tracking.render();
        if (state.activeView === "view-dashboard") ShiftApp.views.dashboard.render();
        if (state.activeView === "view-attendance") ShiftApp.views.attendance.render();
        if (state.activeView === "view-admin") ShiftApp.views.admin.render();
        store.saveState();
    }

    function bindAppEvents() {
        document.getElementById("headerTimeStepper").addEventListener("click", e => {
            const btn = e.target.closest("[data-step-unit]");
            if (!btn) return;
            const unit = btn.getAttribute("data-step-unit");
            const dir = Number(btn.getAttribute("data-step-dir")) || 0;
            ShiftApp.actions.stepMockClock(unit, dir);
        });

        const applyHeaderInputs = () => {
            const h = document.getElementById("headerClockHour").value;
            const m = document.getElementById("headerClockMinute").value;
            ShiftApp.actions.setMockClockHm(h, m);
        };
        document.getElementById("headerClockHour").addEventListener("change", applyHeaderInputs);
        document.getElementById("headerClockMinute").addEventListener("change", applyHeaderInputs);

        document.getElementById("headerUseRealClockBtn").addEventListener("click", () => {
            ShiftApp.actions.useRealClock();
        });

        document.getElementById("headerAccessModeBtn").addEventListener("click", () => {
            const state = store.getState();
            ShiftApp.actions.setDemoAccessMode(state.demoAccessMode === "free" ? "strict" : "free");
        });

        document.getElementById("changeOwnPasswordBtn").addEventListener("click", () => {
            ShiftApp.modals.openChangePassword();
        });

        document.getElementById("logoutBtn").addEventListener("click", () => {
            ShiftApp.actions.logout();
        });

        document.getElementById("userSwitcher").addEventListener("change", e => {
            ShiftApp.actions.switchUser(e.target.value);
        });

        document.getElementById("resetDemoBtn").addEventListener("click", () => {
            store.resetState(true);
            ShiftApp.modals.close();
            ShiftApp.views.admin.resetAdminUserForm();
            ShiftApp.views.admin.resetAdminBranchForm();
            ShiftApp.views.admin.resetAdminReasonForm();
            document.getElementById("shiftTaskFilter").value = "all";
            document.getElementById("centerFilterBranch").value = "";
            document.getElementById("centerFilterReason").value = "";
            document.getElementById("devFilterStatus").value = "active";
            document.getElementById("trackingSearch").value = "";
            document.getElementById("trackingFilterBranch").value = "";
            document.getElementById("trackingFilterStatus").value = "";
            document.getElementById("dashFilterBranch").value = "";
            document.getElementById("dashFilterReason").value = "";
            document.getElementById("dashFilterStatus").value = "";
            document.getElementById("staffBoardGroupFilter").value = "active-shift";
            document.getElementById("staffBoardTaskStatusFilter").value = "all";
            document.getElementById("staffBoardSearch").value = "";
            document.getElementById("attendanceFilterShift").value = "";
            document.getElementById("attendanceFilterStatus").value = "";
            document.getElementById("attendanceSearch").value = "";
            renderAll();
            store.showToast("รีเซ็ตข้อมูลกลับสู่ข้อมูลจำลองเริ่มต้นเรียบร้อย", "info");
        });

        document.getElementById("mainNav").addEventListener("click", e => {
            const tab = e.target.closest(".nav-tab");
            if (!tab) return;
            ShiftApp.actions.switchView(tab.getAttribute("data-view"));
        });

        document.querySelector(".app-main").addEventListener("click", e => {
            const actionBtn = e.target.closest("[data-action]");
            if (actionBtn) {
                const action = actionBtn.getAttribute("data-action");
                const id = actionBtn.getAttribute("data-id");
                if (action === "close") ShiftApp.modals.openCloseTicket(id);
                else if (action === "handover") ShiftApp.modals.openHandover(id);
                else if (action === "escalate") ShiftApp.modals.openEscalateDev(id);
                else if (action === "pickup") ShiftApp.actions.pickUpTicket(id);
                else if (action === "dev-update") ShiftApp.modals.openDevUpdate(id);
                else if (action === "dev-return") ShiftApp.modals.openDevReturnCenter(id);
                else if (action === "timeline") ShiftApp.modals.openTimeline(id);
                return;
            }

            const adminBtn = e.target.closest("[data-admin-action]");
            if (adminBtn) {
                ShiftApp.views.admin.handleAdminAction(
                    adminBtn.getAttribute("data-admin-action"),
                    adminBtn.getAttribute("data-id")
                );
            }
        });
    }

    ShiftApp.renderAll = renderAll;

    ShiftApp.modals.bindEvents();
    ShiftApp.views.auth.bindEvents();
    ShiftApp.views.shift.bindEvents();
    ShiftApp.views.center.bindEvents();
    ShiftApp.views.dev.bindEvents();
    ShiftApp.views.staffBoard.bindEvents();
    ShiftApp.views.tracking.bindEvents();
    ShiftApp.views.dashboard.bindEvents();
    ShiftApp.views.attendance.bindEvents();
    ShiftApp.views.admin.bindEvents();
    bindAppEvents();

    ShiftApp.views.admin.syncAdminUserShiftVisibility();
    renderAll();
})();
