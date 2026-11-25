(() => {
    const ShiftApp = window.ShiftApp;
    const { SHIFT_CONFIG, ROLE_CONFIG } = ShiftApp.config;
    const store = ShiftApp.store;

    function getShortRoleLabel(user) {
        if (user.role === "shift") {
            return SHIFT_CONFIG[user.shift]?.label || "พนักงานกะ";
        }
        if (user.role === "dev") return "ทีม Dev";
        return ROLE_CONFIG.admin.label;
    }

    function render() {
        const state = store.getState();
        const authScreen = document.getElementById("authScreen");
        const appHeader = document.getElementById("appHeader");
        const appMain = document.getElementById("appMain");
        const appFooter = document.getElementById("appFooter");

        const isAuth = Boolean(state.isAuthenticated);
        authScreen.classList.toggle("hidden", isAuth);
        appHeader.classList.toggle("hidden", !isAuth);
        appMain.classList.toggle("hidden", !isAuth);
        appFooter.classList.toggle("hidden", !isAuth);

        if (isAuth) return;

        const mode = state.demoAccessMode === "free" ? "free" : "strict";
        document.querySelectorAll("#loginAccessModeSwitch [data-access-mode]").forEach(btn => {
            btn.classList.toggle("active", btn.getAttribute("data-access-mode") === mode);
        });

        document.getElementById("loginTimeControlPanel").classList.toggle("hidden", mode === "free");
        document.getElementById("loginFreeModeHint").classList.toggle("hidden", mode !== "free");

        const timeInfo = store.getCurrentTimeInfo();
        const pad = n => String(n).padStart(2, "0");
        const badgeEl = document.getElementById("loginClockModeBadge");
        if (badgeEl) {
            badgeEl.textContent = timeInfo.isMock ? "เวลาจำลอง" : "เวลาจริง";
            badgeEl.classList.toggle("is-mock", timeInfo.isMock);
        }

        const hourInput = document.getElementById("loginClockHour");
        const minInput = document.getElementById("loginClockMinute");
        if (hourInput && document.activeElement !== hourInput) hourInput.value = pad(timeInfo.hours);
        if (minInput && document.activeElement !== minInput) minInput.value = pad(timeInfo.minutes);

        const useRealBtn = document.getElementById("loginUseRealClockBtn");
        if (useRealBtn) {
            useRealBtn.classList.toggle("hidden", !timeInfo.isMock);
        }

        document.querySelectorAll("#loginMockClockPresets [data-clock-preset]").forEach(btn => {
            const preset = btn.getAttribute("data-clock-preset");
            btn.classList.toggle("active", timeInfo.isMock && timeInfo.hhmm === preset);
        });

        const quickContainer = document.getElementById("loginQuickUsers");
        const activeUsers = state.users.filter(u => u.active);
        quickContainer.innerHTML = activeUsers.map(u => {
            const codeDisplay = u.employeeCode && u.employeeCode !== u.username
                ? `${u.username} / ${u.employeeCode}`
                : u.username;
            const roleLabel = getShortRoleLabel(u);
            const access = store.checkShiftLoginAccess(u, timeInfo.hhmm);
            const lockedClass = !access.allowed ? "is-outside-shift" : "";
            const statusTag = !access.allowed
                ? `<span class="quick-chip-locked-tag">นอกเวลา</span>`
                : "";
            return `
                <button type="button" class="auth-quick-chip ${lockedClass}" data-quick-user="${store.escapeHtml(u.username)}">
                    <span class="quick-chip-top">
                        <strong>${store.escapeHtml(u.name)}</strong>
                        ${statusTag}
                    </span>
                    <span class="quick-chip-meta">${store.escapeHtml(codeDisplay)} • ${store.escapeHtml(roleLabel)}</span>
                </button>
            `;
        }).join("");
    }

    function bindEvents() {
        document.getElementById("loginForm").addEventListener("submit", e => {
            e.preventDefault();
            const username = document.getElementById("loginUsername").value;
            const password = document.getElementById("loginPassword").value;
            const errEl = document.getElementById("loginError");

            const res = ShiftApp.actions.login(username, password);
            if (!res.ok) {
                errEl.textContent = res.error;
                errEl.classList.remove("hidden");
                return;
            }

            errEl.textContent = "";
            errEl.classList.add("hidden");
            document.getElementById("loginPassword").value = "";
        });

        document.getElementById("loginAccessModeSwitch").addEventListener("click", e => {
            const btn = e.target.closest("[data-access-mode]");
            if (!btn) return;
            const errEl = document.getElementById("loginError");
            errEl.textContent = "";
            errEl.classList.add("hidden");
            ShiftApp.actions.setDemoAccessMode(btn.getAttribute("data-access-mode"), true);
        });

        document.getElementById("loginTimeStepper").addEventListener("click", e => {
            const btn = e.target.closest("[data-step-unit]");
            if (!btn) return;
            const unit = btn.getAttribute("data-step-unit");
            const dir = Number(btn.getAttribute("data-step-dir")) || 0;
            ShiftApp.actions.stepMockClock(unit, dir);
        });

        const applyLoginInputs = () => {
            const h = document.getElementById("loginClockHour").value;
            const m = document.getElementById("loginClockMinute").value;
            ShiftApp.actions.setMockClockHm(h, m);
        };
        document.getElementById("loginClockHour").addEventListener("change", applyLoginInputs);
        document.getElementById("loginClockMinute").addEventListener("change", applyLoginInputs);

        document.getElementById("loginMockClockPresets").addEventListener("click", e => {
            const btn = e.target.closest("[data-clock-preset]");
            if (!btn) return;
            ShiftApp.actions.setMockClockTime(btn.getAttribute("data-clock-preset"));
        });

        document.getElementById("loginUseRealClockBtn").addEventListener("click", () => {
            ShiftApp.actions.useRealClock();
        });

        document.getElementById("loginQuickUsers").addEventListener("click", e => {
            const btn = e.target.closest("[data-quick-user]");
            if (!btn) return;
            const username = btn.getAttribute("data-quick-user");
            const state = store.getState();
            const target = state.users.find(u => u.username === username);
            document.getElementById("loginUsername").value = username;
            const pwInput = document.getElementById("loginPassword");
            if (target && String(target.password ?? "1234") === "1234") {
                pwInput.value = "1234";
            } else {
                pwInput.value = "";
                pwInput.focus();
            }
            const errEl = document.getElementById("loginError");
            errEl.textContent = "";
            errEl.classList.add("hidden");
        });

        document.getElementById("loginResetDemoBtn").addEventListener("click", () => {
            store.resetState(false);
            const errEl = document.getElementById("loginError");
            errEl.textContent = "";
            errEl.classList.add("hidden");
            document.getElementById("loginUsername").value = "";
            document.getElementById("loginPassword").value = "";
            ShiftApp.renderAll();
            store.showToast("รีเซ็ตข้อมูลจำลองเรียบร้อย", "info");
        });
    }

    ShiftApp.views.auth = { render, bindEvents };
})();
