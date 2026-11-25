(() => {
    const ShiftApp = (window.ShiftApp = window.ShiftApp || {
        config: {},
        data: {},
        store: {},
        xlsx: {},
        modals: {},
        actions: {},
        views: {},
        renderAll: null
    });

    ShiftApp.config = {
        STORAGE_KEY: "shift_task_tracker_v3_state",

        SHIFT_CONFIG: {
            A: {
                code: "A",
                label: "กะกลางวัน",
                shortLabel: "กลางวัน",
                hours: "08.30–17.30 น.",
                startTime: "08:30",
                endTime: "17:30",
                crossesMidnight: false,
                next: "B"
            },
            B: {
                code: "B",
                label: "กะเย็น",
                shortLabel: "เย็น",
                hours: "16.30–01.30 น.",
                startTime: "16:30",
                endTime: "01:30",
                crossesMidnight: true,
                next: "C"
            },
            C: {
                code: "C",
                label: "กะเช้า",
                shortLabel: "เช้า",
                hours: "00.30–09.30 น.",
                startTime: "00:30",
                endTime: "09:30",
                crossesMidnight: false,
                next: "A"
            }
        },

        ATTENDANCE_RULES: {
            earlyWindowMinutes: 30,
            lateMaxMinutes: 10
        },

        ROLE_CONFIG: {
            shift: {
                label: "พนักงานกะ",
                defaultView: "view-shift",
                badgeClass: "role-shift"
            },
            dev: {
                label: "ทีม Dev",
                hours: "08.00–17.00 น.",
                defaultView: "view-dev",
                badgeClass: "role-dev"
            },
            admin: {
                label: "Admin / หัวหน้างาน",
                defaultView: "view-dashboard",
                badgeClass: "role-admin"
            }
        },

        ROLE_VIEWS: {
            shift: ["view-shift", "view-center", "view-staff-board", "view-tracking", "view-dashboard", "view-attendance"],
            dev: ["view-dev", "view-staff-board", "view-tracking", "view-dashboard", "view-attendance"],
            admin: ["view-dashboard", "view-staff-board", "view-tracking", "view-attendance", "view-admin"]
        },

        STATUS_META: {
            IN_PROGRESS: { label: "กำลังทำ", className: "status-badge status-in-progress" },
            IN_CENTER: { label: "ถังกลาง", className: "status-badge status-in-center" },
            DEV_QUEUE: { label: "รอ Dev", className: "status-badge status-dev-queue" },
            DEV_PROGRESS: { label: "Dev แก้ไข", className: "status-badge status-dev-progress" },
            CLOSED: { label: "ปิดแล้ว", className: "status-badge status-closed" }
        },

        EVENT_DOT_CLASS: {
            CREATED: "ev-created",
            HANDOVER_CENTER: "ev-handover",
            PICKUP: "ev-pickup",
            ESCALATE_DEV: "ev-escalate",
            DEV_UPDATE: "ev-dev-update",
            DEV_RETURN_CENTER: "ev-dev-return",
            CLOSED: "ev-closed"
        }
    };
})();
