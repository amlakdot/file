const API_URL =
    "https://YOUR-WORKER.workers.dev";

let files = [];
let currentUser = null;

async function api(path, options = {}) {
    const response = await fetch(
        `${API_URL}${path}`,
        {
            ...options,
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            }
        }
    );

    const data =
        await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            data.error || "خطا در ارتباط با سرور"
        );
    }

    return data;
}


/* =========================
   LOGIN
========================= */

async function login(username, password) {
    const result = await api(
        "/api/login",
        {
            method: "POST",
            body: JSON.stringify({
                username,
                password
            })
        }
    );

    currentUser = result.user;

    await loadFiles();

    renderApp();
}


/* =========================
   LOGOUT
========================= */

async function logout() {
    await api(
        "/api/logout",
        {
            method: "POST"
        }
    );

    currentUser = null;
    files = [];

    renderLogin();
}


/* =========================
   CHECK SESSION
========================= */

async function checkSession() {
    try {
        const result =
            await api("/api/me");

        currentUser =
            result.user;

        await loadFiles();

        renderApp();

    } catch {
        renderLogin();
    }
}


/* =========================
   LOAD FILES
========================= */

async function loadFiles() {
    const result =
        await api("/api/files");

    files =
        result.files || [];

    updateFollowUpStatuses();

    renderHome();
}


/* =========================
   CREATE
========================= */

async function createFile(file) {
    const result =
        await api(
            "/api/files",
            {
                method: "POST",
                body: JSON.stringify(file)
            }
        );

    await loadFiles();

    return result.file;
}


/* =========================
   UPDATE
========================= */

async function updateFile(id, file) {
    await api(
        `/api/files/${encodeURIComponent(id)}`,
        {
            method: "PUT",
            body: JSON.stringify(file)
        }
    );

    await loadFiles();
}


/* =========================
   DELETE
========================= */

async function deleteFile(id) {
    if (
        currentUser?.role !== "admin"
    ) {
        throw new Error(
            "فقط مدیر می‌تواند فایل را حذف کند."
        );
    }

    await api(
        `/api/files/${encodeURIComponent(id)}`,
        {
            method: "DELETE"
        }
    );

    await loadFiles();
}


/* =========================
   FOLLOW-UP
========================= */

function updateFollowUpStatuses() {
    const now = Date.now();

    for (const file of files) {
        if (
            file.status === "archived" ||
            file.status === "done"
        ) {
            continue;
        }

        if (!file.followUpDate) {
            continue;
        }

        const deadline =
            new Date(
                file.followUpDate
            ).getTime();

        if (
            Number.isFinite(deadline) &&
            deadline <= now
        ) {
            file.status =
                "followup";
        }
    }
}


/* =========================
   RENEW
========================= */

async function renewFollowUp(
    file,
    days
) {
    const date =
        new Date();

    date.setDate(
        date.getDate() + Number(days)
    );

    await updateFile(
        file.id,
        {
            type: file.type,
            data: file.data,
            status: "active",
            followUpDate:
                date.toISOString(),
            followUpDays:
                Number(days)
        }
    );
}
