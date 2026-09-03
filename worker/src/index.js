const jsonHeaders = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
};

function json(data, status = 200, origin = "*") {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            ...jsonHeaders,
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin"
        }
    });
}

function cors(request, env) {
    const origin = request.headers.get("Origin");

    if (!origin || origin === env.ALLOWED_ORIGIN) {
        return origin || env.ALLOWED_ORIGIN;
    }

    return null;
}

function randomId(bytes = 32) {
    const array = new Uint8Array(bytes);
    crypto.getRandomValues(array);

    return [...array]
        .map(x => x.toString(16).padStart(2, "0"))
        .join("");
}

async function sha256(value) {
    const data = new TextEncoder().encode(value);

    const hash = await crypto.subtle.digest(
        "SHA-256",
        data
    );

    return [...new Uint8Array(hash)]
        .map(x => x.toString(16).padStart(2, "0"))
        .join("");
}

async function passwordHash(password, salt) {
    const encoder = new TextEncoder();

    const baseKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: encoder.encode(salt),
            iterations: 310000,
            hash: "SHA-256"
        },
        baseKey,
        256
    );

    return [...new Uint8Array(bits)]
        .map(x => x.toString(16).padStart(2, "0"))
        .join("");
}

function parsePasswordHash(stored) {
    const [salt, hash] = stored.split(":");

    return {
        salt,
        hash
    };
}

function makePasswordRecord(password) {
    const salt = randomId(16);

    return passwordHash(password, salt)
        .then(hash => `${salt}:${hash}`);
}

async function verifyPassword(password, stored) {
    const { salt, hash } = parsePasswordHash(stored);

    const actual = await passwordHash(password, salt);

    return actual === hash;
}

function cookieValue(request) {
    const cookie = request.headers.get("Cookie") || "";

    const match = cookie.match(
        /(?:^|;\s*)dot_session=([^;]+)/
    );

    return match ? match[1] : null;
}

async function getSession(request, env) {
    const token = cookieValue(request);

    if (!token) {
        return null;
    }

    const tokenHash = await sha256(token);

    const session = await env.DB
        .prepare(`
            SELECT
                sessions.id,
                sessions.user_id,
                sessions.expires_at,
                users.username,
                users.role,
                users.active
            FROM sessions
            JOIN users
                ON users.id = sessions.user_id
            WHERE sessions.id = ?
              AND sessions.expires_at > ?
              AND users.active = 1
        `)
        .bind(tokenHash, new Date().toISOString())
        .first();

    return session || null;
}

function sessionCookie(token, maxAge = 60 * 60 * 24 * 7) {
    return [
        `dot_session=${token}`,
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=None",
        `Max-Age=${maxAge}`
    ].join("; ");
}

function clearSessionCookie() {
    return [
        "dot_session=",
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=None",
        "Max-Age=0"
    ].join("; ");
}

function validateFile(input) {
    if (!input || typeof input !== "object") {
        throw new Error("اطلاعات فایل نامعتبر است.");
    }

    const allowedTypes = [
        "sale",
        "landlord",
        "buyer",
        "tenant"
    ];

    if (!allowedTypes.includes(input.type)) {
        throw new Error("نوع فایل نامعتبر است.");
    }

    if (!input.data || typeof input.data !== "object") {
        throw new Error("اطلاعات فایل ناقص است.");
    }

    return true;
}

function normalizeStatus(status) {
    const allowed = [
        "active",
        "followup",
        "reserved",
        "done",
        "archived"
    ];

    return allowed.includes(status)
        ? status
        : "active";
}

async function nextCode(env) {
    const row = await env.DB
        .prepare(`
            SELECT code
            FROM files
            ORDER BY CAST(SUBSTR(code, 5) AS INTEGER) DESC
            LIMIT 1
        `)
        .first();

    let number = 1;

    if (row?.code) {
        const current = Number(
            row.code.replace("DOT-", "")
        );

        if (Number.isFinite(current)) {
            number = current + 1;
        }
    }

    return `DOT-${String(number).padStart(4, "0")}`;
}

async function requireSession(request, env) {
    const session = await getSession(request, env);

    if (!session) {
        throw new Response(
            JSON.stringify({
                error: "UNAUTHORIZED"
            }),
            {
                status: 401,
                headers: jsonHeaders
            }
        );
    }

    return session;
}

export default {
    async fetch(request, env) {
        const origin = cors(request, env);

        if (!origin) {
            return new Response("Forbidden", {
                status: 403
            });
        }

        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": origin,
                    "Access-Control-Allow-Credentials": "true",
                    "Access-Control-Allow-Headers":
                        "Content-Type, X-CSRF-Token",
                    "Access-Control-Allow-Methods":
                        "GET, POST, PUT, DELETE, OPTIONS",
                    "Vary": "Origin"
                }
            });
        }

        const url = new URL(request.url);

        try {
            /*
             * LOGIN
             */
            if (
                url.pathname === "/api/login" &&
                request.method === "POST"
            ) {
                const body = await request.json();

                const username =
                    String(body.username || "").trim();

                const password =
                    String(body.password || "");

                if (!username || !password) {
                    return json(
                        { error: "نام کاربری و رمز عبور الزامی است." },
                        400,
                        origin
                    );
                }

                const user = await env.DB
                    .prepare(`
                        SELECT *
                        FROM users
                        WHERE username = ?
                          AND active = 1
                    `)
                    .bind(username)
                    .first();

                if (!user) {
                    return json(
                        { error: "نام کاربری یا رمز عبور اشتباه است." },
                        401,
                        origin
                    );
                }

                const valid = await verifyPassword(
                    password,
                    user.password_hash
                );

                if (!valid) {
                    return json(
                        { error: "نام کاربری یا رمز عبور اشتباه است." },
                        401,
                        origin
                    );
                }

                const token = randomId(32);
                const tokenHash = await sha256(token);

                const now = new Date();
                const expires = new Date(
                    now.getTime() +
                    7 * 24 * 60 * 60 * 1000
                );

                await env.DB
                    .prepare(`
                        DELETE FROM sessions
                        WHERE user_id = ?
                           OR expires_at <= ?
                    `)
                    .bind(
                        user.id,
                        now.toISOString()
                    )
                    .run();

                await env.DB
                    .prepare(`
                        INSERT INTO sessions
                        (
                            id,
                            user_id,
                            expires_at,
                            created_at
                        )
                        VALUES (?, ?, ?, ?)
                    `)
                    .bind(
                        tokenHash,
                        user.id,
                        expires.toISOString(),
                        now.toISOString()
                    )
                    .run();

                return new Response(
                    JSON.stringify({
                        ok: true,
                        user: {
                            id: user.id,
                            username: user.username,
                            role: user.role
                        }
                    }),
                    {
                        status: 200,
                        headers: {
                            ...jsonHeaders,
                            "Access-Control-Allow-Origin": origin,
                            "Access-Control-Allow-Credentials": "true",
                            "Set-Cookie": sessionCookie(token),
                            "Vary": "Origin"
                        }
                    }
                );
            }

            /*
             * LOGOUT
             */
            if (
                url.pathname === "/api/logout" &&
                request.method === "POST"
            ) {
                const token = cookieValue(request);

                if (token) {
                    const hash = await sha256(token);

                    await env.DB
                        .prepare(`
                            DELETE FROM sessions
                            WHERE id = ?
                        `)
                        .bind(hash)
                        .run();
                }

                return new Response(
                    JSON.stringify({ ok: true }),
                    {
                        headers: {
                            ...jsonHeaders,
                            "Access-Control-Allow-Origin": origin,
                            "Access-Control-Allow-Credentials": "true",
                            "Set-Cookie": clearSessionCookie(),
                            "Vary": "Origin"
                        }
                    }
                );
            }

            /*
             * CURRENT USER
             */
            if (
                url.pathname === "/api/me" &&
                request.method === "GET"
            ) {
                const session =
                    await requireSession(request, env);

                return json(
                    {
                        user: {
                            id: session.user_id,
                            username: session.username,
                            role: session.role
                        }
                    },
                    200,
                    origin
                );
            }

            /*
             * LIST FILES
             */
            if (
                url.pathname === "/api/files" &&
                request.method === "GET"
            ) {
                await requireSession(request, env);

                const rows = await env.DB
                    .prepare(`
                        SELECT
                            id,
                            code,
                            type,
                            data,
                            status,
                            follow_up_date,
                            follow_up_days,
                            created_by,
                            created_at,
                            updated_at
                        FROM files
                        ORDER BY created_at DESC
                    `)
                    .all();

                const files = rows.results.map(row => ({
                    id: row.id,
                    code: row.code,
                    type: row.type,
                    data: JSON.parse(row.data),
                    status: row.status,
                    followUpDate: row.follow_up_date,
                    followUpDays: row.follow_up_days,
                    createdBy: row.created_by,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at
                }));

                return json(
                    { files },
                    200,
                    origin
                );
            }

            /*
             * CREATE FILE
             */
            if (
                url.pathname === "/api/files" &&
                request.method === "POST"
            ) {
                const session =
                    await requireSession(request, env);

                const body = await request.json();

                validateFile(body);

                const id = randomId(16);
                const code = await nextCode(env);

                const now =
                    new Date().toISOString();

                const status =
                    normalizeStatus(body.status);

                await env.DB
                    .prepare(`
                        INSERT INTO files
                        (
                            id,
                            code,
                            type,
                            data,
                            status,
                            follow_up_date,
                            follow_up_days,
                            created_by,
                            created_at,
                            updated_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `)
                    .bind(
                        id,
                        code,
                        body.type,
                        JSON.stringify(body.data),
                        status,
                        body.followUpDate || null,
                        body.followUpDays || null,
                        session.user_id,
                        now,
                        now
                    )
                    .run();

                return json(
                    {
                        ok: true,
                        file: {
                            id,
                            code
                        }
                    },
                    201,
                    origin
                );
            }

            /*
             * UPDATE FILE
             */
            const fileMatch =
                url.pathname.match(
                    /^\/api\/files\/([^/]+)$/
                );

            if (
                fileMatch &&
                request.method === "PUT"
            ) {
                const session =
                    await requireSession(request, env);

                const id = fileMatch[1];

                const body =
                    await request.json();

                validateFile(body);

                const existing =
                    await env.DB
                        .prepare(`
                            SELECT *
                            FROM files
                            WHERE id = ?
                        `)
                        .bind(id)
                        .first();

                if (!existing) {
                    return json(
                        { error: "فایل پیدا نشد." },
                        404,
                        origin
                    );
                }

                /*
                 * مشاور فقط فایل خودش را ویرایش می‌کند.
                 * مدیر می‌تواند همه را ویرایش کند.
                 */
                if (
                    session.role !== "admin" &&
                    existing.created_by !== session.user_id
                ) {
                    return json(
                        { error: "اجازه ویرایش این فایل را ندارید." },
                        403,
                        origin
                    );
                }

                const now =
                    new Date().toISOString();

                await env.DB
                    .prepare(`
                        UPDATE files
                        SET
                            type = ?,
                            data = ?,
                            status = ?,
                            follow_up_date = ?,
                            follow_up_days = ?,
                            updated_at = ?
                        WHERE id = ?
                    `)
                    .bind(
                        body.type,
                        JSON.stringify(body.data),
                        normalizeStatus(body.status),
                        body.followUpDate || null,
                        body.followUpDays || null,
                        now,
                        id
                    )
                    .run();

                return json(
                    { ok: true },
                    200,
                    origin
                );
            }

            /*
             * DELETE FILE
             */
            if (
                fileMatch &&
                request.method === "DELETE"
            ) {
                const session =
                    await requireSession(request, env);

                if (session.role !== "admin") {
                    return json(
                        { error: "فقط مدیر می‌تواند فایل حذف کند." },
                        403,
                        origin
                    );
                }

                await env.DB
                    .prepare(`
                        UPDATE files
                        SET
                            status = 'archived',
                            updated_at = ?
                        WHERE id = ?
                    `)
                    .bind(
                        new Date().toISOString(),
                        fileMatch[1]
                    )
                    .run();

                return json(
                    { ok: true },
                    200,
                    origin
                );
            }

            return json(
                { error: "Not Found" },
                404,
                origin
            );

        } catch (error) {
            if (error instanceof Response) {
                return error;
            }

            console.error(error);

            return json(
                {
                    error: "خطای داخلی سرور."
                },
                500,
                origin
            );
        }
    }
};
