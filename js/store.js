(() => {
    const ShiftApp = window.ShiftApp;
    const { STORAGE_KEY, SHIFT_CONFIG, ROLE_CONFIG, STATUS_META, ATTENDANCE_RULES } = ShiftApp.config;
    const EARLY_WINDOW_MIN = ATTENDANCE_RULES?.earlyWindowMinutes ?? 30;
    const LATE_MAX_MIN = ATTENDANCE_RULES?.lateMaxMinutes ?? 10;

    function loadState() {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return ShiftApp.data.createInitialState();
            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.users) || !Array.isArray(parsed.tickets)) {
                return ShiftApp.data.createInitialState();
            }
            if (typeof parsed.isAuthenticated !== "boolean") parsed.isAuthenticated = false;
            if (parsed.demoAccessMode !== "strict" && parsed.demoAccessMode !== "free") parsed.demoAccessMode = "strict";
            if (!Array.isArray(parsed.authLogs)) parsed.authLogs = ShiftApp.data.createInitialState().authLogs;
            if (typeof parsed.currentSessionLogId === "undefined") parsed.currentSessionLogId = null;
            if (!parsed.clock || typeof parsed.clock !== "object") parsed.clock = { mode: "real", time: "" };
            if (parsed.clock.mode !== "mock" && parsed.clock.mode !== "real") parsed.clock.mode = "real";
            parsed.users.forEach(u => {
                if (!u.password) u.password = "1234";
                if (typeof u.mustChangePassword !== "boolean") u.mustChangePassword = false;
            });
            parsed.authLogs.forEach(log => {
                if (log.punctuality === "ontime" || log.punctuality === "early") {
                    if ((Number(log.earlyMinutes) || 0) > EARLY_WINDOW_MIN) {
                        log.punctuality = "too_early";
                        log.punctualityLabel = "ก่อนเวลากะ";
                    } else {
                        log.punctuality = "normal";
                        log.punctualityLabel = "เข้างานปกติ";
                    }
                } else if (log.punctuality === "late" || log.punctuality === "very_late") {
                    const lateMin = Number(log.lateMinutes) || 0;
                    if (lateMin > LATE_MAX_MIN) {
                        log.punctuality = "very_late";
                        log.punctualityLabel = `สายมาก (${formatMinutesThai(lateMin)})`;
                    } else if (lateMin > 0) {
                        log.punctuality = "late";
                        log.punctualityLabel = `สาย (${formatMinutesThai(lateMin)})`;
                    }
                }
            });
            return parsed;
        } catch (_) {
            return ShiftApp.data.createInitialState();
        }
    }

    let state = loadState();

    function getState() {
        return state;
    }

    function saveState() {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (_) {
            // Fallback cleanly when file:// storage is restricted
        }
    }

    function resetState(keepAuthenticated = false) {
        try {
            window.localStorage.removeItem(STORAGE_KEY);
        } catch (_) {}
        state = ShiftApp.data.createInitialState();
        if (keepAuthenticated === true) {
            state.isAuthenticated = true;
        }
        return state;
    }

    function escapeHtml(value) {
        if (value === null || value === undefined) return "";
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function getCurrentTimeInfo() {
        const d = new Date();
        const pad = n => String(n).padStart(2, "0");
        const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

        const isMock = Boolean(
            state.clock &&
            state.clock.mode === "mock" &&
            /^\d{2}:\d{2}$/.test(state.clock.time || "")
        );

        let hours = d.getHours();
        let minutes = d.getMinutes();
        if (isMock) {
            const [mh, mm] = state.clock.time.split(":").map(Number);
            hours = mh;
            minutes = mm;
        }
        const hhmm = `${pad(hours)}:${pad(minutes)}`;
        return {
            hours,
            minutes,
            hhmm,
            dateStr,
            formatted: `${dateStr} ${hhmm}`,
            isMock
        };
    }

    function formatNow() {
        return getCurrentTimeInfo().formatted;
    }

    function formatMinutesThai(mins) {
        const absMins = Math.max(0, Math.round(Number(mins) || 0));
        if (absMins >= 60) {
            const h = Math.floor(absMins / 60);
            const m = absMins % 60;
            return `${h} ชม.${m > 0 ? ` ${m} นาที` : ""}`;
        }
        return `${absMins} นาที`;
    }

    function formatDurationThai(mins) {
        if (mins === null || mins === undefined || Number.isNaN(Number(mins))) return "-";
        const num = Math.max(0, Math.round(Number(mins)));
        if (num < 1) return "< 1 นาที";
        return formatMinutesThai(num);
    }

    function parseFormattedTimestampUtc(ts) {
        const match = String(ts || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
        if (!match) return null;
        return Date.UTC(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3]),
            Number(match[4]),
            Number(match[5])
        );
    }

    function computeDurationMinutes(loginAt, logoutAt) {
        const inMs = parseFormattedTimestampUtc(loginAt);
        const outMs = parseFormattedTimestampUtc(logoutAt);
        if (inMs === null || outMs === null) return null;
        let diff = Math.round((outMs - inMs) / 60000);
        if (diff < 0) diff += 1440;
        return Math.max(0, diff);
    }

    function formatMinsDot(totalMins) {
        const norm = ((totalMins % 1440) + 1440) % 1440;
        const h = String(Math.floor(norm / 60)).padStart(2, "0");
        const m = String(norm % 60).padStart(2, "0");
        return `${h}.${m}`;
    }

    function checkShiftLoginAccess(user, hhmm) {
        if (!user) {
            return { allowed: false, withinWindow: false, reason: "ไม่พบข้อมูลผู้ใช้งาน" };
        }
        if (user.role === "admin") {
            return {
                allowed: true,
                withinWindow: true,
                bypassed: false,
                shiftLabel: "Admin",
                openTime: "00.00",
                closeTime: "23.59"
            };
        }

        const sc = user.role === "shift" ? SHIFT_CONFIG[user.shift] : null;
        const startTime = sc ? sc.startTime : "08:00";
        const endTime = sc ? sc.endTime : "17:00";
        const shiftLabel = sc ? sc.label : "ทีม Dev";

        const [sh, sm] = String(startTime).split(":").map(Number);
        const [eh, em] = String(endTime).split(":").map(Number);
        const [nh, nm] = String(hhmm || startTime).split(":").map(Number);

        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;
        let duration = endMin - startMin;
        if (duration <= 0) duration += 1440;

        const windowOpenMin = (startMin - EARLY_WINDOW_MIN + 1440) % 1440;
        const nowMin = nh * 60 + nm;
        const elapsedFromOpen = (nowMin - windowOpenMin + 1440) % 1440;
        const withinWindow = elapsedFromOpen <= (duration + EARLY_WINDOW_MIN);

        const openTime = formatMinsDot(windowOpenMin);
        const closeTime = formatMinsDot(endMin);

        if (state.demoAccessMode === "free") {
            return {
                allowed: true,
                withinWindow,
                bypassed: !withinWindow,
                shiftLabel,
                openTime,
                closeTime
            };
        }

        if (withinWindow) {
            return {
                allowed: true,
                withinWindow: true,
                bypassed: false,
                shiftLabel,
                openTime,
                closeTime
            };
        }

        return {
            allowed: false,
            withinWindow: false,
            bypassed: false,
            shiftLabel,
            openTime,
            closeTime,
            reason: `อยู่นอกเวลาเข้างานของ${shiftLabel} (เปิดให้เข้าช่วง ${openTime}–${closeTime} น. • เวลาปัจจุบัน ${hhmm}) — ปรับเวลาด้านบนหรือสลับเป็น "โหมดอิสระ (ทุกกะ)"`
        };
    }

    function evaluateLoginPunctuality(user, hhmm) {
        if (!user || user.role === "admin") {
            return {
                status: "neutral",
                lateMinutes: 0,
                earlyMinutes: 0,
                label: "ปกติ"
            };
        }

        const targetStart = user.role === "shift"
            ? (SHIFT_CONFIG[user.shift]?.startTime || "08:30")
            : "08:00";

        const [h, m] = String(hhmm || targetStart).split(":").map(Number);
        const [sh, sm] = String(targetStart).split(":").map(Number);
        let diff = (h * 60 + m) - (sh * 60 + sm);
        if (diff > 720) diff -= 1440;
        if (diff < -720) diff += 1440;

        if (diff < -EARLY_WINDOW_MIN) {
            return {
                status: "too_early",
                lateMinutes: 0,
                earlyMinutes: Math.abs(diff),
                label: "ก่อนเวลากะ"
            };
        }
        if (diff <= 0) {
            return {
                status: "normal",
                lateMinutes: 0,
                earlyMinutes: Math.abs(diff),
                label: "เข้างานปกติ"
            };
        }
        if (diff <= LATE_MAX_MIN) {
            return {
                status: "late",
                lateMinutes: diff,
                earlyMinutes: 0,
                label: `สาย (${formatMinutesThai(diff)})`
            };
        }
        return {
            status: "very_late",
            lateMinutes: diff,
            earlyMinutes: 0,
            label: `สายมาก (${formatMinutesThai(diff)})`
        };
    }

    function nextId(prefix, list, minPad = 3) {
        const maxNum = list.reduce((max, item) => {
            const num = Number(String(item.id).replace(prefix, "")) || 0;
            return Math.max(max, num);
        }, 0);
        return prefix + String(maxNum + 1).padStart(minPad, "0");
    }

    function getCurrentUser() {
        let user = state.users.find(u => u.id === state.currentUserId && u.active);
        if (!user) {
            user = state.users.find(u => u.active) || state.users[0];
            if (user) state.currentUserId = user.id;
        }
        return user;
    }

    function getUserRoleLabel(user) {
        if (!user) return "-";
        if (user.role === "shift") {
            const sc = SHIFT_CONFIG[user.shift];
            return sc ? `${sc.label} • ${sc.hours}` : "พนักงานกะ";
        }
        if (user.role === "dev") {
            return `ทีม Dev • ${ROLE_CONFIG.dev.hours}`;
        }
        return ROLE_CONFIG.admin.label;
    }

    function getBranchDisplay(branchId, fallbackName) {
        const b = state.branches.find(item => item.id === branchId);
        if (b) return `${b.code} ${b.name}`;
        return fallbackName || "-";
    }

    function getReasonDisplay(reasonId, fallbackLabel) {
        if (!reasonId) return fallbackLabel || "-";
        const r = state.reasons.find(item => item.id === reasonId);
        return r ? r.label : (fallbackLabel || "-");
    }

    function getShiftMeta(ticket) {
        const timeline = Array.isArray(ticket.timeline) ? ticket.timeline : [];
        const missedShifts = timeline.filter(
            ev => ev.type === "HANDOVER_CENTER" || ev.type === "ESCALATE_DEV"
        ).length;

        const contributors = [];
        const seen = new Set();
        timeline.forEach(ev => {
            const key = `${ev.actorId || ev.actorName}|${ev.actorRole || ""}`;
            if (!seen.has(key) && ev.actorName) {
                seen.add(key);
                contributors.push(`${ev.actorName}${ev.actorRole ? ` (${ev.actorRole})` : ""}`);
            }
        });

        const stints = Array.isArray(ticket.shiftStints) && ticket.shiftStints.length > 0
            ? ticket.shiftStints.map(s => (s === "Dev" ? "ทีม Dev" : (SHIFT_CONFIG[s]?.label || `กะ ${s}`)))
            : [ticket.createdShift ? (SHIFT_CONFIG[ticket.createdShift]?.label || `กะ ${ticket.createdShift}`) : "-"];

        if (ticket.status === "IN_CENTER") {
            stints.push("ถังกลาง (Center)");
        } else if (ticket.status === "CLOSED") {
            stints.push("ปิดงานแล้ว");
        }

        let waitingSummary = "-";
        if (ticket.status === "CLOSED") {
            waitingSummary = `ปิดงานแล้วเมื่อ ${ticket.closedAt || "-"} โดย ${ticket.closedByName || "-"}`;
        } else if (ticket.status === "IN_CENTER") {
            const reasonText = getReasonDisplay(ticket.pendingReasonId, ticket.pendingReasonLabel);
            waitingSummary = `${reasonText}${ticket.pendingNote ? ` — ${ticket.pendingNote}` : ""}`;
        } else if (ticket.status === "DEV_QUEUE" || ticket.status === "DEV_PROGRESS") {
            waitingSummary = `รอทีมพัฒนา (Dev)${ticket.pendingNote ? ` — ${ticket.pendingNote}` : ""}`;
        } else if (ticket.status === "IN_PROGRESS") {
            const curLabel = SHIFT_CONFIG[ticket.currentShift]?.label || `กะ ${ticket.currentShift || "-"}`;
            waitingSummary = `กำลังดำเนินการอยู่ที่ ${curLabel} (${ticket.currentOwnerName || "-"})`;
        }

        return {
            missedShifts,
            shiftPath: stints.join(" → "),
            contributors,
            waitingSummary
        };
    }

    function renderStatusBadgeHtml(status) {
        const meta = STATUS_META[status] || { label: status, className: "status-badge" };
        return `<span class="${meta.className}">${escapeHtml(meta.label)}</span>`;
    }

    function renderAgingBadgeHtml(missedShifts) {
        let cls = "aging-0";
        if (missedShifts === 1) {
            cls = "aging-1";
        } else if (missedShifts >= 2) {
            cls = "aging-high";
        }
        return `<span class="aging-badge ${cls}">${missedShifts} กะ</span>`;
    }

    function populateSelectWithOptions(selectEl, allLabel, options, currentVal) {
        const html = [`<option value="">${escapeHtml(allLabel)}</option>`]
            .concat(options.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`))
            .join("");
        selectEl.innerHTML = html;
        if (options.some(o => o.value === currentVal)) {
            selectEl.value = currentVal;
        } else {
            selectEl.value = "";
        }
    }

    function showToast(message, type = "info") {
        const container = document.getElementById("toastContainer");
        if (!container) return;

        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span>${escapeHtml(message)}</span>
            <button type="button" class="toast-close" aria-label="ปิดการแจ้งเตือน">&times;</button>
        `;
        toast.querySelector(".toast-close").addEventListener("click", () => toast.remove());
        container.appendChild(toast);

        window.setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 4500);
    }

    function isShiftUserOnDuty(user) {
        return Boolean(user && user.role === "shift" && state.shiftOnDuty[user.shift]);
    }

    function getCurrentShiftTickets(shiftCode) {
        const currentSessionId = state.shiftSession[shiftCode];
        const openTickets = state.tickets.filter(
            t => t.status === "IN_PROGRESS" && t.currentShift === shiftCode
        );
        const closedInSession = state.shiftOnDuty[shiftCode]
            ? state.tickets.filter(
                t => t.status === "CLOSED" && t.closedInShift === shiftCode && t.closedSessionId === currentSessionId
            )
            : [];
        return { openTickets, closedInSession };
    }

    function getThaiInitials(name) {
        const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return "?";
        const pickChar = word => {
            const match = word.match(/[\u0E01-\u0E2EA-Za-z0-9]/);
            return match ? match[0].toUpperCase() : word.charAt(0);
        };
        if (parts.length === 1) return pickChar(parts[0]);
        return pickChar(parts[0]) + pickChar(parts[1]);
    }

    function getDefaultAvatarColor(user) {
        if (user.role === "dev") return "#7c3aed";
        if (user.role === "admin") return "#16a34a";
        if (user.shift === "B") return "#0284c7";
        if (user.shift === "C") return "#4f46e5";
        return "#2563eb";
    }

    function getUserProfile(user) {
        if (!user) {
            return {
                employeeCode: "-",
                position: "-",
                department: "-",
                avatarColor: "#64748b",
                initials: "?",
                hoursLabel: "-",
                isOnDuty: false,
                dutyLabel: "-"
            };
        }

        const shiftCfg = user.role === "shift" ? SHIFT_CONFIG[user.shift] : null;
        const fallbackPosition = user.role === "shift"
            ? `ช่าง${shiftCfg ? shiftCfg.label : "กะ"}`
            : (user.role === "dev" ? "ทีมพัฒนา" : "ผู้ดูแลระบบ");
        const fallbackDepartment = user.role === "shift"
            ? "ฝ่ายสนับสนุนหน้างาน"
            : (user.role === "dev" ? "ทีมพัฒนา (Dev Team)" : "ศูนย์ควบคุม (INA)");

        const hoursLabel = user.role === "shift"
            ? (shiftCfg ? `${shiftCfg.label} (${shiftCfg.hours})` : "-")
            : (user.role === "dev" ? `ทีม Dev • ${ROLE_CONFIG.dev.hours}` : "ทุกช่วงเวลา");

        const isOnDuty = user.role === "shift" ? Boolean(state.shiftOnDuty[user.shift]) : true;
        const dutyLabel = user.role === "shift"
            ? (isOnDuty ? "เข้ากะอยู่" : "ยังไม่เริ่มกะ")
            : (user.role === "dev" ? ROLE_CONFIG.dev.hours : "ทุกช่วงเวลา");

        return {
            employeeCode: user.employeeCode || user.id,
            position: user.position || fallbackPosition,
            department: user.department || fallbackDepartment,
            avatarColor: user.avatarColor || getDefaultAvatarColor(user),
            initials: getThaiInitials(user.name),
            hoursLabel,
            isOnDuty,
            dutyLabel
        };
    }

    function getUserTicketsSummary(user) {
        if (!user) {
            return { total: 0, activeCount: 0, closedCount: 0, handedOverCount: 0, tickets: [] };
        }

        // สำหรับพนักงานประจำกะ: นับเฉพาะรอบกะปัจจุบันเมื่อกำลังเข้างานอยู่เท่านั้น
        if (user.role === "shift") {
            if (!state.shiftOnDuty[user.shift]) {
                return { total: 0, activeCount: 0, closedCount: 0, handedOverCount: 0, tickets: [] };
            }

            const currentSessionId = state.shiftSession[user.shift];
            let activeCount = 0;
            let closedCount = 0;
            let handedOverCount = 0;
            const mapped = [];

            state.tickets.forEach(t => {
                const isActiveInHand =
                    t.status === "IN_PROGRESS" &&
                    t.currentShift === user.shift &&
                    t.currentOwnerId === user.id;

                const isClosedInSession =
                    t.status === "CLOSED" &&
                    t.closedById === user.id &&
                    t.closedSessionId === currentSessionId;

                const isHandedOverInSession =
                    !isActiveInHand &&
                    !isClosedInSession &&
                    Array.isArray(t.timeline) &&
                    t.timeline.some(
                        ev =>
                            ev.actorId === user.id &&
                            ev.sessionId === currentSessionId &&
                            (ev.type === "HANDOVER_CENTER" || ev.type === "ESCALATE_DEV")
                    );

                if (isActiveInHand) {
                    activeCount += 1;
                    mapped.push({ ticket: t, relationLabel: "กำลังทำ", priority: 0 });
                } else if (isHandedOverInSession) {
                    handedOverCount += 1;
                    let relationLabel = "ส่งต่อแล้ว";
                    if (t.status === "IN_CENTER") relationLabel = "ส่งเข้ากลาง";
                    else if (t.status === "DEV_QUEUE" || t.status === "DEV_PROGRESS") relationLabel = "ส่งทีม Dev";
                    mapped.push({ ticket: t, relationLabel, priority: 1 });
                } else if (isClosedInSession) {
                    closedCount += 1;
                    mapped.push({ ticket: t, relationLabel: "ปิดแล้ว", priority: 2 });
                }
            });

            mapped.sort((a, b) => {
                if (a.priority !== b.priority) return a.priority - b.priority;
                return b.ticket.id.localeCompare(a.ticket.id);
            });

            return {
                total: mapped.length,
                activeCount,
                closedCount,
                handedOverCount,
                tickets: mapped
            };
        }

        // สำหรับบทบาทอื่น (เช่น Dev Team)
        const related = state.tickets.filter(
            t =>
                t.currentOwnerId === user.id ||
                t.closedById === user.id ||
                (Array.isArray(t.timeline) && t.timeline.some(ev => ev.actorId === user.id))
        );

        let activeCount = 0;
        let closedCount = 0;
        let handedOverCount = 0;

        const mapped = related.map(t => {
            const isActiveInHand =
                t.currentOwnerId === user.id &&
                (t.status === "IN_PROGRESS" || t.status === "DEV_PROGRESS");
            const isClosedByUser = t.status === "CLOSED" && t.closedById === user.id;

            let relationLabel = "ส่งต่องานแล้ว";
            let priority = 2;

            if (isActiveInHand) {
                activeCount += 1;
                relationLabel = "กำลังดูแลอยู่";
                priority = 0;
            } else if (isClosedByUser) {
                closedCount += 1;
                relationLabel = "ปิดงานเรียบร้อย";
                priority = 3;
            } else {
                handedOverCount += 1;
                if (t.status === "IN_CENTER") relationLabel = "ส่งกลับถังกลางแล้ว";
                priority = t.status === "CLOSED" ? 3 : 1;
            }

            return { ticket: t, relationLabel, priority };
        });

        mapped.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return b.ticket.id.localeCompare(a.ticket.id);
        });

        return {
            total: mapped.length,
            activeCount,
            closedCount,
            handedOverCount,
            tickets: mapped
        };
    }

    ShiftApp.store = {
        getState,
        saveState,
        resetState,
        escapeHtml,
        getCurrentTimeInfo,
        formatNow,
        formatMinutesThai,
        formatDurationThai,
        computeDurationMinutes,
        checkShiftLoginAccess,
        evaluateLoginPunctuality,
        nextId,
        getCurrentUser,
        getUserRoleLabel,
        getBranchDisplay,
        getReasonDisplay,
        getShiftMeta,
        renderStatusBadgeHtml,
        renderAgingBadgeHtml,
        populateSelectWithOptions,
        showToast,
        isShiftUserOnDuty,
        getCurrentShiftTickets,
        getUserProfile,
        getUserTicketsSummary
    };
})();
