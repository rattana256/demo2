(() => {
    const ShiftApp = window.ShiftApp;
    const { SHIFT_CONFIG, ROLE_CONFIG, ROLE_VIEWS } = ShiftApp.config;
    const store = ShiftApp.store;

    function validateNewPassword(newPassword, confirmPassword) {
        const nextPw = String(newPassword || "");
        const confirmPw = String(confirmPassword || "");
        if (nextPw.length < 4) {
            return "รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร";
        }
        if (nextPw === "1234") {
            return "กรุณาตั้งรหัสผ่านใหม่ที่ไม่ซ้ำกับรหัสเริ่มต้น (1234)";
        }
        if (nextPw !== confirmPw) {
            return "รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน";
        }
        return null;
    }

    function recordLoginEvent(user) {
        const state = store.getState();
        if (!Array.isArray(state.authLogs)) state.authLogs = [];
        const timeInfo = store.getCurrentTimeInfo();
        const evalRes = store.evaluateLoginPunctuality(user, timeInfo.hhmm);

        const entry = {
            id: store.nextId("LOG", state.authLogs),
            userId: user.id,
            employeeCode: user.employeeCode || user.username,
            userName: user.name,
            role: user.role,
            shift: user.shift,
            loginAt: timeInfo.formatted,
            loginTime: timeInfo.hhmm,
            logoutAt: null,
            logoutTime: null,
            durationMinutes: null,
            punctuality: evalRes.status,
            lateMinutes: evalRes.lateMinutes,
            earlyMinutes: evalRes.earlyMinutes,
            punctualityLabel: evalRes.label
        };

        state.authLogs.unshift(entry);
        state.currentSessionLogId = entry.id;
        return entry;
    }

    function recordLogoutEvent() {
        const state = store.getState();
        if (!Array.isArray(state.authLogs) || !state.currentSessionLogId) return;
        const entry = state.authLogs.find(item => item.id === state.currentSessionLogId && !item.logoutAt);
        if (entry) {
            const timeInfo = store.getCurrentTimeInfo();
            entry.logoutAt = timeInfo.formatted;
            entry.logoutTime = timeInfo.hhmm;
            entry.durationMinutes = store.computeDurationMinutes(entry.loginAt, timeInfo.formatted);
        }
        state.currentSessionLogId = null;
    }

    function completeLogin(user, customPrefix = "") {
        const state = store.getState();
        state.currentUserId = user.id;
        state.isAuthenticated = true;
        state.activeView = ROLE_CONFIG[user.role].defaultView;

        recordLoginEvent(user);
        ShiftApp.modals.close();
        ShiftApp.renderAll();

        const prefix = customPrefix ? `${customPrefix} • ` : "";
        store.showToast(`${prefix}เข้าสู่ระบบสำเร็จ: ${user.name} (${store.getUserRoleLabel(user)})`, "success");
    }

    function login(identifier, password) {
        const state = store.getState();
        const cleanId = String(identifier || "").trim();
        const cleanPw = String(password || "");
        if (!cleanId || !cleanPw) {
            return { ok: false, error: "กรุณากรอกรหัสพนักงานและรหัสผ่าน" };
        }

        const idLower = cleanId.toLowerCase();
        const user = state.users.find(
            u =>
                (u.username || "").toLowerCase() === idLower ||
                (u.employeeCode || "").toLowerCase() === idLower
        );
        if (!user) {
            return { ok: false, error: "ไม่พบรหัสพนักงานหรือ Username นี้ในระบบ" };
        }
        if (!user.active) {
            return { ok: false, error: "บัญชีผู้ใช้งานนี้ถูกปิดใช้งาน กรุณาติดต่อ Admin" };
        }
        if (String(user.password ?? "1234") !== cleanPw) {
            return { ok: false, error: "รหัสผ่านไม่ถูกต้อง" };
        }

        const timeInfo = store.getCurrentTimeInfo();
        const access = store.checkShiftLoginAccess(user, timeInfo.hhmm);
        if (!access.allowed) {
            return { ok: false, error: access.reason };
        }

        completeLogin(user);
        return { ok: true };
    }

    function changeOwnPassword(currentPassword, newPassword, confirmPassword) {
        const user = store.getCurrentUser();
        if (!user) return { ok: false, error: "ไม่พบบัญชีผู้ใช้งาน" };

        if (String(user.password ?? "1234") !== String(currentPassword || "")) {
            return { ok: false, error: "รหัสผ่านเดิมไม่ถูกต้อง" };
        }
        const err = validateNewPassword(newPassword, confirmPassword);
        if (err) {
            return { ok: false, error: err };
        }

        user.password = String(newPassword);
        user.mustChangePassword = false;
        ShiftApp.modals.close();
        ShiftApp.renderAll();
        store.showToast("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว", "success");
        return { ok: true };
    }

    function resetUserPassword(userId) {
        const state = store.getState();
        if (store.getCurrentUser().role !== "admin") return;
        const target = state.users.find(u => u.id === userId);
        if (!target) return;

        target.password = "1234";
        target.mustChangePassword = false;
        ShiftApp.renderAll();
        store.showToast(`รีเซ็ตรหัสผ่านของ ${target.name} เป็น 1234 เรียบร้อยแล้ว`, "info");
    }

    function logout() {
        const state = store.getState();
        recordLogoutEvent();
        state.isAuthenticated = false;
        ShiftApp.modals.close();
        ShiftApp.renderAll();
        store.showToast("ออกจากระบบเรียบร้อย", "info");
    }

    function setDemoAccessMode(mode, silent = false) {
        const state = store.getState();
        const nextMode = mode === "free" ? "free" : "strict";
        state.demoAccessMode = nextMode;
        ShiftApp.renderAll();
        if (!silent && state.isAuthenticated) {
            store.showToast(
                nextMode === "free"
                    ? "เปิดโหมดอิสระ: สามารถเข้าสู่ระบบได้ทุกกะทุกเวลา"
                    : "เปิดโหมดตรวจเวลากะ: จำกัดการเข้างานตามช่วงเวลากะจริง",
                "info"
            );
        }
    }

    function setMockClockTime(hhmm) {
        const state = store.getState();
        if (!/^\d{2}:\d{2}$/.test(String(hhmm || ""))) return;
        state.clock = { mode: "mock", time: String(hhmm) };
        ShiftApp.renderAll();
    }

    function setMockClockHm(hours, minutes) {
        const hRaw = Number(hours);
        const mRaw = Number(minutes);
        const h = Math.max(0, Math.min(23, Number.isNaN(hRaw) ? 0 : Math.floor(hRaw)));
        const m = Math.max(0, Math.min(59, Number.isNaN(mRaw) ? 0 : Math.floor(mRaw)));
        const pad = n => String(n).padStart(2, "0");
        setMockClockTime(`${pad(h)}:${pad(m)}`);
    }

    function stepMockClock(unit, delta) {
        const step = Number(delta) || 0;
        const timeInfo = store.getCurrentTimeInfo();
        let h = timeInfo.hours;
        let m = timeInfo.minutes;
        if (unit === "hour") {
            h = (h + step + 24) % 24;
        } else {
            const total = (h * 60 + m + step + 1440) % 1440;
            h = Math.floor(total / 60);
            m = total % 60;
        }
        const pad = n => String(n).padStart(2, "0");
        setMockClockTime(`${pad(h)}:${pad(m)}`);
    }

    function useRealClock() {
        const state = store.getState();
        state.clock = { mode: "real", time: "" };
        ShiftApp.renderAll();
    }

    function switchUser(userId) {
        const state = store.getState();
        const target = state.users.find(u => u.id === userId && u.active);
        if (!target) {
            store.showToast("ไม่พบบัญชีผู้ใช้งานนี้หรือบัญชีถูกปิดใช้งาน", "error");
            return false;
        }
        const timeInfo = store.getCurrentTimeInfo();
        const access = store.checkShiftLoginAccess(target, timeInfo.hhmm);
        if (!access.allowed) {
            ShiftApp.renderAll();
            store.showToast(access.reason, "warning");
            return false;
        }
        state.currentUserId = target.id;
        state.activeView = ROLE_CONFIG[target.role].defaultView;
        ShiftApp.modals.close();
        ShiftApp.renderAll();
        store.showToast(`สลับผู้ใช้งานเป็น ${target.name} (${store.getUserRoleLabel(target)})`, "info");
        return true;
    }

    function switchView(viewId) {
        const state = store.getState();
        const user = store.getCurrentUser();
        const allowed = ROLE_VIEWS[user.role] || [];
        if (!allowed.includes(viewId)) {
            store.showToast("บทบาทปัจจุบันไม่มีสิทธิ์เข้าถึงหน้านี้", "warning");
            return;
        }
        state.activeView = viewId;
        ShiftApp.renderAll();
    }

    function startShift() {
        const state = store.getState();
        const user = store.getCurrentUser();
        if (user.role !== "shift") {
            store.showToast("เฉพาะพนักงานประจำกะเท่านั้นที่สามารถเริ่มกะได้", "error");
            return;
        }
        if (state.shiftOnDuty[user.shift]) {
            store.showToast(`${SHIFT_CONFIG[user.shift].label} กำลังปฏิบัติงานอยู่แล้ว`, "warning");
            return;
        }
        state.shiftOnDuty[user.shift] = true;
        state.shiftSessionSeq[user.shift] = (state.shiftSessionSeq[user.shift] || 0) + 1;
        state.shiftSession[user.shift] = `${user.shift}-${state.shiftSessionSeq[user.shift]}`;

        const centerCount = state.tickets.filter(t => t.status === "IN_CENTER").length;
        ShiftApp.renderAll();
        if (centerCount > 0) {
            store.showToast(`เริ่ม${SHIFT_CONFIG[user.shift].label} แล้ว — มีงานค้างในถังกลาง ${centerCount} งานรอรับช่วงต่อ`, "success");
        } else {
            store.showToast(`เริ่ม${SHIFT_CONFIG[user.shift].label} เรียบร้อยแล้ว`, "success");
        }
    }

    function requestEndShift() {
        const state = store.getState();
        const user = store.getCurrentUser();
        if (user.role !== "shift" || !state.shiftOnDuty[user.shift]) {
            store.showToast("ยังไม่ได้เริ่มกะการทำงาน", "warning");
            return;
        }

        const openTickets = state.tickets.filter(
            t => t.status === "IN_PROGRESS" && t.currentShift === user.shift
        );

        if (openTickets.length === 0) {
            state.shiftOnDuty[user.shift] = false;
            ShiftApp.renderAll();
            store.showToast(`จบ${SHIFT_CONFIG[user.shift].label} เรียบร้อยแล้ว (ไม่มีงานค้างส่งเข้าถังกลาง)`, "success");
            return;
        }

        ShiftApp.modals.openEndShift(openTickets);
    }

    function confirmEndShiftWithHandovers(handoverEntries) {
        const state = store.getState();
        const user = store.getCurrentUser();
        if (user.role !== "shift" || !state.shiftOnDuty[user.shift]) return false;

        const now = store.formatNow();
        const roleLabel = store.getUserRoleLabel(user);
        const shiftLabel = SHIFT_CONFIG[user.shift].label;

        handoverEntries.forEach(entry => {
            const ticket = state.tickets.find(t => t.id === entry.ticketId);
            if (!ticket || ticket.status !== "IN_PROGRESS" || ticket.currentShift !== user.shift) return;

            const reasonLabel = store.getReasonDisplay(entry.reasonId);
            ticket.status = "IN_CENTER";
            ticket.currentShift = null;
            ticket.currentOwnerId = null;
            ticket.currentOwnerName = null;
            ticket.lastFromLabel = `${shiftLabel} (${user.name})`;
            ticket.pendingReasonId = entry.reasonId;
            ticket.pendingReasonLabel = reasonLabel;
            ticket.pendingNote = entry.note;
            ticket.timeline.push({
                at: now,
                type: "HANDOVER_CENTER",
                sessionId: state.shiftSession[user.shift],
                title: "จบกะและส่งเข้าถังกลาง (Center)",
                actorId: user.id,
                actorName: user.name,
                actorRole: roleLabel,
                reasonId: entry.reasonId,
                reasonLabel,
                note: entry.note
            });
        });

        state.shiftOnDuty[user.shift] = false;
        ShiftApp.modals.close();
        ShiftApp.renderAll();
        store.showToast(`จบ${shiftLabel} และโยนงานค้าง ${handoverEntries.length} งานเข้าถังกลางเรียบร้อย`, "success");
        return true;
    }

    function switchToNextShiftUser() {
        const state = store.getState();
        const user = store.getCurrentUser();
        if (user.role !== "shift") return;
        const nextShift = SHIFT_CONFIG[user.shift].next;
        const nextUser = state.users.find(u => u.role === "shift" && u.shift === nextShift && u.active);
        if (!nextUser) {
            store.showToast(`ไม่พบบัญชีพนักงานที่เปิดใช้งานใน${SHIFT_CONFIG[nextShift]?.label || `กะ ${nextShift}`}`, "warning");
            return;
        }
        switchUser(nextUser.id);
    }

    function createTicket(branchId, detail) {
        const state = store.getState();
        const user = store.getCurrentUser();
        if (!store.isShiftUserOnDuty(user)) {
            store.showToast("กรุณากดเริ่มกะก่อนรับงานใหม่", "warning");
            return false;
        }

        const branch = state.branches.find(b => b.id === branchId && b.active);
        if (!branch) {
            store.showToast("กรุณาเลือกสาขาที่ถูกต้อง", "warning");
            return false;
        }

        const cleanDetail = detail.trim();
        if (!cleanDetail) {
            store.showToast("กรุณากรอกรายละเอียดปัญหา", "warning");
            return false;
        }

        const now = store.formatNow();
        const newId = store.nextId("TK", state.tickets);
        const branchDisplay = `${branch.code} ${branch.name}`;

        state.tickets.unshift({
            id: newId,
            branchId: branch.id,
            branchName: branchDisplay,
            detail: cleanDetail,
            status: "IN_PROGRESS",
            createdAt: now,
            createdById: user.id,
            createdByName: user.name,
            createdShift: user.shift,
            currentShift: user.shift,
            currentOwnerId: user.id,
            currentOwnerName: user.name,
            lastFromLabel: null,
            pendingReasonId: null,
            pendingReasonLabel: null,
            pendingNote: "",
            closedAt: null,
            closedById: null,
            closedByName: null,
            closedByRoleLabel: null,
            closedInShift: null,
            closedSessionId: null,
            closeNote: "",
            shiftStints: [user.shift],
            timeline: [
                {
                    at: now,
                    type: "CREATED",
                    sessionId: state.shiftSession[user.shift],
                    title: "เปิดงานใหม่",
                    actorId: user.id,
                    actorName: user.name,
                    actorRole: store.getUserRoleLabel(user),
                    note: `เปิดใบงานสาขา ${branchDisplay}: ${cleanDetail}`
                }
            ]
        });

        state.selectedTrackingId = newId;
        ShiftApp.renderAll();
        store.showToast(`เปิดใบงาน ${newId} (${branchDisplay}) เข้า${SHIFT_CONFIG[user.shift].label} เรียบร้อย`, "success");
        return true;
    }

    function closeTicket(ticketId, closeNote) {
        const state = store.getState();
        const user = store.getCurrentUser();
        const ticket = state.tickets.find(t => t.id === ticketId);
        if (!ticket) return false;

        const canShiftClose =
            store.isShiftUserOnDuty(user) &&
            ticket.status === "IN_PROGRESS" &&
            ticket.currentShift === user.shift;

        const canDevClose =
            user.role === "dev" &&
            (ticket.status === "DEV_QUEUE" || ticket.status === "DEV_PROGRESS");

        if (!canShiftClose && !canDevClose) {
            store.showToast("คุณไม่มีสิทธิ์ปิดใบงานนี้ในสถานะปัจจุบัน", "error");
            return false;
        }

        const now = store.formatNow();
        const roleLabel = store.getUserRoleLabel(user);
        const finalNote = closeNote.trim() || "ดำเนินการแก้ไขและตรวจสอบเสร็จสิ้น";

        ticket.status = "CLOSED";
        ticket.currentShift = null;
        ticket.currentOwnerId = null;
        ticket.currentOwnerName = null;
        ticket.pendingReasonId = null;
        ticket.pendingReasonLabel = null;
        ticket.pendingNote = "";
        ticket.closedAt = now;
        ticket.closedById = user.id;
        ticket.closedByName = user.name;
        ticket.closedByRoleLabel = roleLabel;
        ticket.closedInShift = user.role === "shift" ? user.shift : null;
        ticket.closedSessionId = user.role === "shift" ? state.shiftSession[user.shift] : null;
        ticket.closeNote = finalNote;

        ticket.timeline.push({
            at: now,
            type: "CLOSED",
            sessionId: user.role === "shift" ? state.shiftSession[user.shift] : null,
            title: "ปิดงานเรียบร้อย",
            actorId: user.id,
            actorName: user.name,
            actorRole: roleLabel,
            note: finalNote
        });

        ShiftApp.modals.close();
        ShiftApp.renderAll();
        store.showToast(`ปิดงาน ${ticket.id} เรียบร้อย (${now} โดย ${user.name})`, "success");
        return true;
    }

    function handoverToCenter(ticketId, reasonId, note) {
        const state = store.getState();
        const user = store.getCurrentUser();
        const ticket = state.tickets.find(t => t.id === ticketId);
        if (
            !ticket ||
            !store.isShiftUserOnDuty(user) ||
            ticket.status !== "IN_PROGRESS" ||
            ticket.currentShift !== user.shift
        ) {
            store.showToast("ไม่สามารถโยนงานนี้เข้าถังกลางได้", "error");
            return false;
        }

        const reason = state.reasons.find(r => r.id === reasonId && r.active);
        const cleanNote = note.trim();
        if (!reason || !cleanNote) return false;

        const now = store.formatNow();
        const roleLabel = store.getUserRoleLabel(user);

        ticket.status = "IN_CENTER";
        ticket.currentShift = null;
        ticket.currentOwnerId = null;
        ticket.currentOwnerName = null;
        ticket.lastFromLabel = `${SHIFT_CONFIG[user.shift].label} (${user.name})`;
        ticket.pendingReasonId = reason.id;
        ticket.pendingReasonLabel = reason.label;
        ticket.pendingNote = cleanNote;

        ticket.timeline.push({
            at: now,
            type: "HANDOVER_CENTER",
            sessionId: state.shiftSession[user.shift],
            title: "โยนงานเข้าถังกลาง (Center)",
            actorId: user.id,
            actorName: user.name,
            actorRole: roleLabel,
            reasonId: reason.id,
            reasonLabel: reason.label,
            note: cleanNote
        });

        ShiftApp.modals.close();
        ShiftApp.renderAll();
        store.showToast(`ส่งงาน ${ticket.id} เข้าถังกลาง (${reason.label}) เรียบร้อย`, "warning");
        return true;
    }

    function escalateToDev(ticketId, note) {
        const state = store.getState();
        const user = store.getCurrentUser();
        const ticket = state.tickets.find(t => t.id === ticketId);
        if (
            !ticket ||
            !store.isShiftUserOnDuty(user) ||
            ticket.status !== "IN_PROGRESS" ||
            ticket.currentShift !== user.shift
        ) {
            store.showToast("ไม่สามารถส่งต่อทีมพัฒนาได้", "error");
            return false;
        }

        const cleanNote = note.trim();
        if (!cleanNote) return false;

        const now = store.formatNow();
        const roleLabel = store.getUserRoleLabel(user);

        ticket.status = "DEV_QUEUE";
        ticket.currentShift = null;
        ticket.currentOwnerId = null;
        ticket.currentOwnerName = null;
        ticket.lastFromLabel = `${SHIFT_CONFIG[user.shift].label} (${user.name})`;
        ticket.pendingReasonId = null;
        ticket.pendingReasonLabel = "รอทีมพัฒนา (Dev)";
        ticket.pendingNote = cleanNote;
        ticket.shiftStints.push("Dev");

        ticket.timeline.push({
            at: now,
            type: "ESCALATE_DEV",
            sessionId: state.shiftSession[user.shift],
            title: "ส่งต่อทีมพัฒนา (Escalate to Dev)",
            actorId: user.id,
            actorName: user.name,
            actorRole: roleLabel,
            note: cleanNote
        });

        ShiftApp.modals.close();
        ShiftApp.renderAll();
        store.showToast(`ส่งต่อใบงาน ${ticket.id} ไปยังคิวทีมพัฒนาเรียบร้อย`, "info");
        return true;
    }

    function pickUpTicket(ticketId) {
        const state = store.getState();
        const user = store.getCurrentUser();
        if (!store.isShiftUserOnDuty(user)) {
            store.showToast("กรุณากดเริ่มกะก่อนรับช่วงต่องานจากถังกลาง", "warning");
            return;
        }

        const ticket = state.tickets.find(t => t.id === ticketId);
        if (!ticket || ticket.status !== "IN_CENTER") {
            store.showToast("ไม่พบงานนี้ในถังกลางหรือถูกรับช่วงต่อไปแล้ว", "warning");
            return;
        }

        const now = store.formatNow();
        const prevReason = store.getReasonDisplay(ticket.pendingReasonId, ticket.pendingReasonLabel);

        ticket.status = "IN_PROGRESS";
        ticket.currentShift = user.shift;
        ticket.currentOwnerId = user.id;
        ticket.currentOwnerName = user.name;
        ticket.pendingReasonId = null;
        ticket.pendingReasonLabel = null;
        ticket.pendingNote = "";
        ticket.shiftStints.push(user.shift);

        ticket.timeline.push({
            at: now,
            type: "PICKUP",
            sessionId: state.shiftSession[user.shift],
            title: "รับช่วงต่อจากถังกลาง (Pick Up)",
            actorId: user.id,
            actorName: user.name,
            actorRole: store.getUserRoleLabel(user),
            note: `รับช่วงต่องานจาก ${ticket.lastFromLabel || "ถังกลาง"} (เดิมรอ: ${prevReason})`
        });

        ShiftApp.renderAll();
        store.showToast(`${SHIFT_CONFIG[user.shift].label} รับช่วงต่องาน ${ticket.id} เรียบร้อย`, "success");
    }

    function pickUpAllTickets() {
        const state = store.getState();
        const user = store.getCurrentUser();
        if (!store.isShiftUserOnDuty(user)) {
            store.showToast("กรุณากดเริ่มกะก่อนรับงานจากถังกลาง", "warning");
            return;
        }

        const pending = state.tickets.filter(t => t.status === "IN_CENTER");
        if (pending.length === 0) {
            store.showToast("ไม่มีงานค้างในถังกลาง", "info");
            return;
        }

        const now = store.formatNow();
        const roleLabel = store.getUserRoleLabel(user);

        pending.forEach(ticket => {
            const prevReason = store.getReasonDisplay(ticket.pendingReasonId, ticket.pendingReasonLabel);
            ticket.status = "IN_PROGRESS";
            ticket.currentShift = user.shift;
            ticket.currentOwnerId = user.id;
            ticket.currentOwnerName = user.name;
            ticket.pendingReasonId = null;
            ticket.pendingReasonLabel = null;
            ticket.pendingNote = "";
            ticket.shiftStints.push(user.shift);

            ticket.timeline.push({
                at: now,
                type: "PICKUP",
                sessionId: state.shiftSession[user.shift],
                title: "รับช่วงต่อจากถังกลาง (Pick Up)",
                actorId: user.id,
                actorName: user.name,
                actorRole: roleLabel,
                note: `รับช่วงต่อทั้งหมดเข้า${SHIFT_CONFIG[user.shift]?.label || `กะ ${user.shift}`} (เดิมรอ: ${prevReason})`
            });
        });

        ShiftApp.renderAll();
        store.showToast(`${SHIFT_CONFIG[user.shift].label} รับช่วงต่องานจากถังกลางทั้งหมด ${pending.length} งานแล้ว`, "success");
    }

    function devUpdateProgress(ticketId, note) {
        const state = store.getState();
        const user = store.getCurrentUser();
        const ticket = state.tickets.find(t => t.id === ticketId);
        if (!ticket || user.role !== "dev" || (ticket.status !== "DEV_QUEUE" && ticket.status !== "DEV_PROGRESS")) {
            store.showToast("ไม่สามารถอัปเดตงานนี้ได้", "error");
            return false;
        }

        const cleanNote = note.trim();
        if (!cleanNote) return false;

        const now = store.formatNow();
        ticket.status = "DEV_PROGRESS";
        ticket.currentOwnerId = user.id;
        ticket.currentOwnerName = user.name;
        ticket.pendingReasonLabel = "รอทีมพัฒนา (Dev)";
        ticket.pendingNote = cleanNote;

        ticket.timeline.push({
            at: now,
            type: "DEV_UPDATE",
            title: "ทีม Dev อัปเดตผลการแก้ไข",
            actorId: user.id,
            actorName: user.name,
            actorRole: store.getUserRoleLabel(user),
            note: cleanNote
        });

        ShiftApp.modals.close();
        ShiftApp.renderAll();
        store.showToast(`อัปเดตผลการแก้ไขใบงาน ${ticket.id} เรียบร้อย`, "success");
        return true;
    }

    function devReturnToCenter(ticketId, reasonId, note) {
        const state = store.getState();
        const user = store.getCurrentUser();
        const ticket = state.tickets.find(t => t.id === ticketId);
        if (!ticket || user.role !== "dev" || (ticket.status !== "DEV_QUEUE" && ticket.status !== "DEV_PROGRESS")) {
            store.showToast("ไม่สามารถส่งงานกลับส่วนกลางได้", "error");
            return false;
        }

        const reason = state.reasons.find(r => r.id === reasonId && r.active);
        const cleanNote = note.trim();
        if (!reason || !cleanNote) return false;

        const now = store.formatNow();
        ticket.status = "IN_CENTER";
        ticket.currentShift = null;
        ticket.currentOwnerId = null;
        ticket.currentOwnerName = null;
        ticket.lastFromLabel = `ทีมพัฒนา (${user.name})`;
        ticket.pendingReasonId = reason.id;
        ticket.pendingReasonLabel = reason.label;
        ticket.pendingNote = cleanNote;

        ticket.timeline.push({
            at: now,
            type: "DEV_RETURN_CENTER",
            title: "ทีม Dev ส่งงานกลับเข้าถังกลาง (Center)",
            actorId: user.id,
            actorName: user.name,
            actorRole: store.getUserRoleLabel(user),
            reasonId: reason.id,
            reasonLabel: reason.label,
            note: cleanNote
        });

        ShiftApp.modals.close();
        ShiftApp.renderAll();
        store.showToast(`ส่งงาน ${ticket.id} กลับเข้าถังกลาง (${reason.label}) เรียบร้อย`, "info");
        return true;
    }

    /* Admin CRUD */
    function saveAdminUser(formData) {
        const state = store.getState();
        const currentUser = store.getCurrentUser();
        if (currentUser.role !== "admin") return;

        const name = formData.name.trim();
        const username = formData.username.trim();
        const role = formData.role;
        const shift = role === "shift" ? formData.shift : null;

        if (!name || !username) {
            store.showToast("กรุณากรอกชื่อและ Username ให้ครบถ้วน", "warning");
            return;
        }

        const dup = state.users.find(
            u => u.username.toLowerCase() === username.toLowerCase() && u.id !== formData.id
        );
        if (dup) {
            store.showToast(`Username "${username}" ถูกใช้งานแล้ว`, "warning");
            return;
        }

        if (formData.id) {
            const target = state.users.find(u => u.id === formData.id);
            if (!target) return;
            if (target.id === currentUser.id && role !== "admin") {
                store.showToast("ไม่สามารถเปลี่ยนบทบาทของบัญชี Admin ที่กำลังล็อกอินอยู่ได้", "warning");
                return;
            }
            target.name = name;
            target.username = username;
            target.role = role;
            target.shift = shift;
            if (!target.position || target.position.startsWith("ช่างกะ") || target.position.startsWith("ช่างเทคนิคประจำกะ") || target.position === "นักพัฒนาระบบ" || target.position === "ผู้ดูแลระบบ / หัวหน้างาน") {
                target.position = role === "shift"
                    ? `ช่าง${SHIFT_CONFIG[shift]?.label || `กะ ${shift}`}`
                    : (role === "dev" ? "นักพัฒนาระบบ" : "ผู้ดูแลระบบ / หัวหน้างาน");
            }
            target.department = role === "shift"
                ? "ฝ่ายสนับสนุนหน้างาน (Operations)"
                : (role === "dev" ? "ทีมพัฒนา (Dev Team)" : "ศูนย์ควบคุมและติดตามงาน (INA)");
            target.avatarColor = role === "dev" ? "#7c3aed" : (role === "admin" ? "#16a34a" : (shift === "B" ? "#0284c7" : (shift === "C" ? "#4f46e5" : "#2563eb")));
            store.showToast(`อัปเดตข้อมูลผู้ใช้ ${name} เรียบร้อย`, "success");
        } else {
            const id = store.nextId("U", state.users);
            const employeeCode = role === "shift"
                ? `STF-${shift}${id.replace("U", "")}`
                : (role === "dev" ? `DEV-${id.replace("U", "")}` : `ADM-${id.replace("U", "")}`);
            const position = role === "shift"
                ? `ช่าง${SHIFT_CONFIG[shift]?.label || `กะ ${shift}`}`
                : (role === "dev" ? "นักพัฒนาระบบ" : "ผู้ดูแลระบบ / หัวหน้างาน");
            const department = role === "shift"
                ? "ฝ่ายสนับสนุนหน้างาน (Operations)"
                : (role === "dev" ? "ทีมพัฒนา (Dev Team)" : "ศูนย์ควบคุมและติดตามงาน (INA)");
            const avatarColor = role === "dev" ? "#7c3aed" : (role === "admin" ? "#16a34a" : (shift === "B" ? "#0284c7" : (shift === "C" ? "#4f46e5" : "#2563eb")));
            state.users.push({
                id,
                name,
                username,
                password: "1234",
                mustChangePassword: false,
                role,
                shift,
                active: true,
                employeeCode,
                position,
                department,
                avatarColor
            });
            store.showToast(`เพิ่มบัญชีผู้ใช้ ${name} เรียบร้อย`, "success");
        }

        ShiftApp.views.admin.resetAdminUserForm();
        ShiftApp.renderAll();
    }

    function toggleUserActive(userId) {
        const state = store.getState();
        const currentUser = store.getCurrentUser();
        if (currentUser.role !== "admin") return;
        const target = state.users.find(u => u.id === userId);
        if (!target) return;

        if (target.id === currentUser.id) {
            store.showToast("ไม่สามารถปิดใช้งานบัญชีที่กำลังใช้งานอยู่ได้", "warning");
            return;
        }

        if (target.active && target.role === "admin") {
            const activeAdmins = state.users.filter(u => u.role === "admin" && u.active);
            if (activeAdmins.length <= 1) {
                store.showToast("ต้องมีบัญชี Admin ที่เปิดใช้งานอย่างน้อย 1 บัญชี", "warning");
                return;
            }
        }

        target.active = !target.active;
        ShiftApp.renderAll();
        store.showToast(`${target.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}บัญชี ${target.name} แล้ว`, "info");
    }

    function deleteAdminUser(userId) {
        const state = store.getState();
        const currentUser = store.getCurrentUser();
        if (currentUser.role !== "admin") return;
        const target = state.users.find(u => u.id === userId);
        if (!target) return;

        if (target.id === currentUser.id) {
            store.showToast("ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่ได้", "warning");
            return;
        }
        if (target.role === "admin" && state.users.filter(u => u.role === "admin" && u.active).length <= 1 && target.active) {
            store.showToast("ไม่สามารถลบ Admin คนสุดท้ายของระบบได้", "warning");
            return;
        }

        state.users = state.users.filter(u => u.id !== userId);
        ShiftApp.views.admin.resetAdminUserForm();
        ShiftApp.renderAll();
        store.showToast(`ลบบัญชีผู้ใช้ ${target.name} แล้ว`, "info");
    }

    function importAdminUsers(validItems) {
        const state = store.getState();
        const currentUser = store.getCurrentUser();
        if (currentUser.role !== "admin" || !Array.isArray(validItems) || validItems.length === 0) return;

        let createdCount = 0;
        let updatedCount = 0;

        validItems.forEach(item => {
            const codeLower = item.code.toLowerCase();
            const existing = state.users.find(
                u => u.id === item.existingId ||
                    (u.username || "").toLowerCase() === codeLower ||
                    (u.employeeCode || "").toLowerCase() === codeLower
            );

            const role = item.role;
            const shift = role === "shift" ? item.shift : null;
            const position = role === "shift"
                ? `ช่าง${SHIFT_CONFIG[shift]?.label || `กะ ${shift}`}`
                : (role === "dev" ? "นักพัฒนาระบบ" : "ผู้ดูแลระบบ / หัวหน้างาน");
            const department = role === "shift"
                ? "ฝ่ายสนับสนุนหน้างาน (Operations)"
                : (role === "dev" ? "ทีมพัฒนา (Dev Team)" : "ศูนย์ควบคุมและติดตามงาน (INA)");
            const avatarColor = role === "dev"
                ? "#7c3aed"
                : (role === "admin" ? "#16a34a" : (shift === "B" ? "#0284c7" : (shift === "C" ? "#4f46e5" : "#2563eb")));

            if (existing) {
                if (existing.id === currentUser.id && role !== "admin") {
                    existing.name = item.name;
                    updatedCount += 1;
                    return;
                }
                existing.name = item.name;
                existing.username = item.code;
                existing.employeeCode = item.code;
                existing.role = role;
                existing.shift = shift;
                existing.position = position;
                existing.department = department;
                existing.avatarColor = avatarColor;
                updatedCount += 1;
            } else {
                const id = store.nextId("U", state.users);
                state.users.push({
                    id,
                    name: item.name,
                    username: item.code,
                    employeeCode: item.code,
                    role,
                    shift,
                    active: true,
                    password: "1234",
                    mustChangePassword: false,
                    position,
                    department,
                    avatarColor
                });
                createdCount += 1;
            }
        });

        ShiftApp.modals.close();
        ShiftApp.renderAll();
        store.showToast(`นำเข้าพนักงานเรียบร้อย (เพิ่มใหม่ ${createdCount} คน, อัปเดต ${updatedCount} คน)`, "success");
    }

    function saveAdminBranch(formData) {
        const state = store.getState();
        if (store.getCurrentUser().role !== "admin") return;
        const code = formData.code.trim().toUpperCase();
        const name = formData.name.trim();

        if (!code || !name) {
            store.showToast("กรุณากรอกรหัสสาขาและชื่อสาขาให้ครบถ้วน", "warning");
            return;
        }

        const dup = state.branches.find(
            b => b.code.toUpperCase() === code && b.id !== formData.id
        );
        if (dup) {
            store.showToast(`รหัสสาขา "${code}" มีอยู่ในระบบแล้ว`, "warning");
            return;
        }

        if (formData.id) {
            const target = state.branches.find(b => b.id === formData.id);
            if (!target) return;
            target.code = code;
            target.name = name;
            store.showToast(`อัปเดตสาขา ${code} ${name} เรียบร้อย`, "success");
        } else {
            const id = store.nextId("BR", state.branches, 2);
            state.branches.push({ id, code, name, active: true });
            store.showToast(`เพิ่มสาขา ${code} ${name} เรียบร้อย`, "success");
        }

        ShiftApp.views.admin.resetAdminBranchForm();
        ShiftApp.renderAll();
    }

    function toggleBranchActive(branchId) {
        const state = store.getState();
        if (store.getCurrentUser().role !== "admin") return;
        const target = state.branches.find(b => b.id === branchId);
        if (!target) return;

        if (target.active && state.branches.filter(b => b.active).length <= 1) {
            store.showToast("ต้องมีสาขาที่เปิดใช้งานอย่างน้อย 1 สาขา", "warning");
            return;
        }

        target.active = !target.active;
        ShiftApp.renderAll();
        store.showToast(`${target.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}สาขา ${target.code} ${target.name} แล้ว`, "info");
    }

    function deleteAdminBranch(branchId) {
        const state = store.getState();
        if (store.getCurrentUser().role !== "admin") return;
        const target = state.branches.find(b => b.id === branchId);
        if (!target) return;

        const usedInTickets = state.tickets.some(t => t.branchId === branchId);
        if (usedInTickets) {
            store.showToast("ไม่สามารถลบสาขาที่มีประวัติใบงานอ้างอิงได้ กรุณากด 'ปิดใช้งาน' แทน", "warning");
            return;
        }
        if (state.branches.filter(b => b.active).length <= 1 && target.active) {
            store.showToast("ต้องมีสาขาที่เปิดใช้งานอย่างน้อย 1 สาขา", "warning");
            return;
        }

        state.branches = state.branches.filter(b => b.id !== branchId);
        ShiftApp.views.admin.resetAdminBranchForm();
        ShiftApp.renderAll();
        store.showToast(`ลบสาขา ${target.code} ${target.name} แล้ว`, "info");
    }

    function saveAdminReason(formData) {
        const state = store.getState();
        if (store.getCurrentUser().role !== "admin") return;
        const label = formData.label.trim();
        if (!label) {
            store.showToast("กรุณากรอกชื่อเหตุผลงานค้าง", "warning");
            return;
        }

        const dup = state.reasons.find(
            r => r.label.toLowerCase() === label.toLowerCase() && r.id !== formData.id
        );
        if (dup) {
            store.showToast(`เหตุผล "${label}" มีอยู่ในระบบแล้ว`, "warning");
            return;
        }

        if (formData.id) {
            const target = state.reasons.find(r => r.id === formData.id);
            if (!target) return;
            target.label = label;
            store.showToast(`อัปเดตเหตุผลงานค้าง "${label}" เรียบร้อย`, "success");
        } else {
            const id = store.nextId("RS", state.reasons, 2);
            state.reasons.push({ id, label, active: true });
            store.showToast(`เพิ่มเหตุผลงานค้าง "${label}" เรียบร้อย`, "success");
        }

        ShiftApp.views.admin.resetAdminReasonForm();
        ShiftApp.renderAll();
    }

    function toggleReasonActive(reasonId) {
        const state = store.getState();
        if (store.getCurrentUser().role !== "admin") return;
        const target = state.reasons.find(r => r.id === reasonId);
        if (!target) return;

        if (target.active && state.reasons.filter(r => r.active).length <= 1) {
            store.showToast("ต้องมีเหตุผลงานค้างที่เปิดใช้งานอย่างน้อย 1 รายการ", "warning");
            return;
        }

        target.active = !target.active;
        ShiftApp.renderAll();
        store.showToast(`${target.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}เหตุผล "${target.label}" แล้ว`, "info");
    }

    function deleteAdminReason(reasonId) {
        const state = store.getState();
        if (store.getCurrentUser().role !== "admin") return;
        const target = state.reasons.find(r => r.id === reasonId);
        if (!target) return;

        const used = state.tickets.some(
            t => t.pendingReasonId === reasonId || (t.timeline || []).some(ev => ev.reasonId === reasonId)
        );
        if (used) {
            store.showToast("เหตุผลนี้ถูกอ้างอิงในใบงานแล้ว กรุณากด 'ปิดใช้งาน' แทน", "warning");
            return;
        }
        if (state.reasons.filter(r => r.active).length <= 1 && target.active) {
            store.showToast("ต้องมีเหตุผลงานค้างที่เปิดใช้งานอย่างน้อย 1 รายการ", "warning");
            return;
        }

        state.reasons = state.reasons.filter(r => r.id !== reasonId);
        ShiftApp.views.admin.resetAdminReasonForm();
        ShiftApp.renderAll();
        store.showToast(`ลบเหตุผล "${target.label}" แล้ว`, "info");
    }

    ShiftApp.actions = {
        login,
        changeOwnPassword,
        resetUserPassword,
        logout,
        setDemoAccessMode,
        setMockClockTime,
        setMockClockHm,
        stepMockClock,
        useRealClock,
        switchUser,
        switchView,
        startShift,
        requestEndShift,
        confirmEndShiftWithHandovers,
        switchToNextShiftUser,
        createTicket,
        closeTicket,
        handoverToCenter,
        escalateToDev,
        pickUpTicket,
        pickUpAllTickets,
        devUpdateProgress,
        devReturnToCenter,
        saveAdminUser,
        toggleUserActive,
        deleteAdminUser,
        importAdminUsers,
        saveAdminBranch,
        toggleBranchActive,
        deleteAdminBranch,
        saveAdminReason,
        toggleReasonActive,
        deleteAdminReason
    };
})();
