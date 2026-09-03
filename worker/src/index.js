// =========================================================
// DOT Real Estate API
// Cloudflare Worker + D1
// =========================================================

const SESSION_COOKIE = "__Host-dot_session";
const SESSION_DAYS = 7;
const PBKDF2_ITERATIONS = 310000;

const ALLOWED_FILE_TYPES = new Set([
  "sale",
  "landlord",
  "buyer",
  "tenant",
]);

const PROPERTY_TYPES = new Set([
  "apartment",
  "villa",
  "office",
  "commercial",
  "land",
  "garden",
  "any",
]);

const KEY_HOLDERS = new Set([
  "owner",
  "tenant",
  "guard",
  "office",
  "other",
]);

const CONDITIONS = new Set([
  "new",
  "unused",
  "renovated",
  "not-renovated",
  "renovating",
]);

const OCCUPANCIES = new Set([
  "empty",
  "tenant",
  "owner",
  "evacuating",
]);

const FAMILY_STATUSES = new Set([
  "single",
  "married",
  "family",
]);

const AMENITIES = new Set([
  "parking",
  "elevator",
  "storage",
  "balcony",
  "terrace",
  "yard",
  "pool",
  "jacuzzi",
  "roof",
  "lobby",
  "guard",
  "package",
  "cooler",
  "floor-heating",
  "cabinet",
  "closet",
]);

// ---------------------------------------------------------
// Main
// ---------------------------------------------------------

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error("Unhandled error:", error);

      return json(
        {
          ok: false,
          error: "خطای داخلی سرور.",
        },
        500,
        request,
        env
      );
    }
  },
};


// =========================================================
// Router
// =========================================================

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  // CORS / preflight
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request, env),
    });
  }

  // Basic health endpoint
  if (url.pathname === "/") {
    return json(
      {
        ok: true,
        service: "DOT Real Estate API",
      },
      200,
      request,
      env
    );
  }

  // Clean expired sessions occasionally.
  // This is intentionally lightweight.
  if (
    method === "POST" ||
    method === "PUT" ||
    method === "DELETE"
  ) {
    await cleanupExpiredSessions(env.DB);
  }

  // -------------------------------------------------------
  // Authentication
  // -------------------------------------------------------

  if (url.pathname === "/api/login" && method === "POST") {
    return handleLogin(request, env);
  }

  if (url.pathname === "/api/logout" && method === "POST") {
    const user = await requireAuth(request, env);

    if (!user.ok) {
      return user.response;
    }

    return handleLogout(request, env, user.user);
  }

  if (url.pathname === "/api/me" && method === "GET") {
    const user = await requireAuth(request, env);

    if (!user.ok) {
      return user.response;
    }

    return json(
      {
        ok: true,
        user: publicUser(user.user),
      },
      200,
      request,
      env
    );
  }

  // -------------------------------------------------------
  // Files
  // -------------------------------------------------------

  if (url.pathname === "/api/files" && method === "GET") {
    const user = await requireAuth(request, env);

    if (!user.ok) {
      return user.response;
    }

    return handleGetFiles(request, env, user.user);
  }

  if (url.pathname === "/api/files" && method === "POST") {
    const user = await requireAuth(request, env);

    if (!user.ok) {
      return user.response;
    }

    if (!checkOrigin(request, env)) {
      return json(
        {
          ok: false,
          error: "درخواست نامعتبر است.",
        },
        403,
        request,
        env
      );
    }

    return handleCreateFile(request, env, user.user);
  }

  const fileMatch = url.pathname.match(/^\/api\/files\/(\d+)$/);

  if (fileMatch) {
    const fileId = Number(fileMatch[1]);

    if (!Number.isSafeInteger(fileId) || fileId <= 0) {
      return json(
        {
          ok: false,
          error: "شناسه فایل نامعتبر است.",
        },
        400,
        request,
        env
      );
    }

    const user = await requireAuth(request, env);

    if (!user.ok) {
      return user.response;
    }

    if (
      method === "PUT" ||
      method === "DELETE"
    ) {
      if (!checkOrigin(request, env)) {
        return json(
          {
            ok: false,
            error: "درخواست نامعتبر است.",
          },
          403,
          request,
          env
        );
      }
    }

    if (method === "PUT") {
      return handleUpdateFile(
        request,
        env,
        user.user,
        fileId
      );
    }

    if (method === "DELETE") {
      return handleDeleteFile(
        request,
        env,
        user.user,
        fileId
      );
    }
  }

  return json(
    {
      ok: false,
      error: "مسیر موردنظر پیدا نشد.",
    },
    404,
    request,
    env
  );
}


// =========================================================
// Authentication
// =========================================================

async function handleLogin(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";

  if (isRateLimited(ip)) {
    return json(
      {
        ok: false,
        error: "تعداد تلاش‌های ورود زیاد است. چند دقیقه بعد دوباره امتحان کنید.",
      },
      429,
      request,
      env
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    registerFailedLogin(ip);

    return json(
      {
        ok: false,
        error: "اطلاعات ورود نامعتبر است.",
      },
      400,
      request,
      env
    );
  }

  const username = cleanString(body?.username, 100);
  const password = typeof body?.password === "string"
    ? body.password
    : "";

  if (!username || !password || password.length > 500) {
    registerFailedLogin(ip);

    return json(
      {
        ok: false,
        error: "نام کاربری یا رمز عبور صحیح نیست.",
      },
      401,
      request,
      env
    );
  }

  const user = await env.DB
    .prepare(
      `
      SELECT
        id,
        username,
        password_hash,
        role,
        name,
        active,
        created_at
      FROM users
      WHERE username = ?
      LIMIT 1
      `
    )
    .bind(username)
    .first();

  if (!user || Number(user.active) !== 1) {
    registerFailedLogin(ip);

    return json(
      {
        ok: false,
        error: "نام کاربری یا رمز عبور صحیح نیست.",
      },
      401,
      request,
      env
    );
  }

  const validPassword = await verifyPassword(
    password,
    user.password_hash
  );

  if (!validPassword) {
    registerFailedLogin(ip);

    return json(
      {
        ok: false,
        error: "نام کاربری یا رمز عبور صحیح نیست.",
      },
      401,
      request,
      env
    );
  }

  clearFailedLogins(ip);

  const token = randomToken(32);
  const tokenHash = await sha256(token);

  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  await env.DB
    .prepare(
      `
      INSERT INTO sessions (
        user_id,
        token_hash,
        expires_at
      )
      VALUES (?, ?, ?)
      `
    )
    .bind(
      user.id,
      tokenHash,
      expiresAt
    )
    .run();

  const headers = corsHeaders(request, env);

  headers.append(
    "Set-Cookie",
    buildSessionCookie(token, SESSION_DAYS)
  );

  return new Response(
    JSON.stringify({
      ok: true,
      user: publicUser(user),
    }),
    {
      status: 200,
      headers,
    }
  );
}


async function handleLogout(request, env) {
  const token = getCookie(request, SESSION_COOKIE);

  if (token) {
    const tokenHash = await sha256(token);

    await env.DB
      .prepare(
        `
        DELETE FROM sessions
        WHERE token_hash = ?
        `
      )
      .bind(tokenHash)
      .run();
  }

  const headers = corsHeaders(request, env);

  headers.append(
    "Set-Cookie",
    clearSessionCookie()
  );

  return new Response(
    JSON.stringify({
      ok: true,
    }),
    {
      status: 200,
      headers,
    }
  );
}


async function requireAuth(request, env) {
  const token = getCookie(request, SESSION_COOKIE);

  if (!token) {
    return {
      ok: false,
      response: json(
        {
          ok: false,
          error: "نیاز به ورود دارید.",
        },
        401,
        request,
        env
      ),
    };
  }

  const tokenHash = await sha256(token);

  const user = await env.DB
    .prepare(
      `
      SELECT
        u.id,
        u.username,
        u.role,
        u.name,
        u.active,
        u.created_at,
        s.expires_at
      FROM sessions s
      INNER JOIN users u
        ON u.id = s.user_id
      WHERE
        s.token_hash = ?
        AND s.expires_at > ?
        AND u.active = 1
      LIMIT 1
      `
    )
    .bind(
      tokenHash,
      new Date().toISOString()
    )
    .first();

  if (!user) {
    return {
      ok: false,
      response: json(
        {
          ok: false,
          error: "نشست شما منقضی شده است. دوباره وارد شوید.",
        },
        401,
        request,
        env
      ),
    };
  }

  return {
    ok: true,
    user,
  };
}


// =========================================================
// Files — GET
// =========================================================

async function handleGetFiles(request, env, user) {
  const url = new URL(request.url);

  const includeArchived =
    url.searchParams.get("archived") === "1";

  let query = `
    SELECT
      f.*,
      creator.username AS created_by_username,
      creator.name AS created_by_name,
      updater.username AS updated_by_username,
      updater.name AS updated_by_name
    FROM files f
    LEFT JOIN users creator
      ON creator.id = f.created_by
    LEFT JOIN users updater
      ON updater.id = f.updated_by
    WHERE 1 = 1
  `;

  const params = [];

  if (!includeArchived) {
    query += ` AND f.status = 'active'`;
  }

  // Consultants see all active files.
  // Archived files are admin-only.
  if (includeArchived && user.role !== "admin") {
    return json(
      {
        ok: false,
        error: "دسترسی کافی ندارید.",
      },
      403,
      request,
      env
    );
  }

  query += `
    ORDER BY
      CASE
        WHEN f.follow_up_at IS NOT NULL
          AND f.follow_up_at <= ?
        THEN 0
        ELSE 1
      END ASC,
      f.created_at DESC
  `;

  params.push(new Date().toISOString());

  const result = await env.DB
    .prepare(query)
    .bind(...params)
    .all();

  const files = (result.results || []).map(serializeFile);

  return json(
    {
      ok: true,
      files,
    },
    200,
    request,
    env
  );
}


// =========================================================
// Files — CREATE
// =========================================================

async function handleCreateFile(request, env, user) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        ok: false,
        error: "اطلاعات فایل نامعتبر است.",
      },
      400,
      request,
      env
    );
  }

  const validation = validateFile(body);

  if (!validation.ok) {
    return json(
      {
        ok: false,
        error: validation.error,
      },
      400,
      request,
      env
    );
  }

  const data = validation.data;

  const code = await getNextFileCode(env.DB);

  if (!code) {
    return json(
      {
        ok: false,
        error: "تولید شماره فایل انجام نشد. دوباره تلاش کنید.",
      },
      500,
      request,
      env
    );
  }

  const followUpAt = calculateFollowUpDate(
    data.followUpDays
  );

  try {
    await env.DB
      .prepare(
        `
        INSERT INTO files (
          code,
          type,
          name,
          phone,
          location,
          property_type,
          area,
          rooms,
          year,
          key_holder,
          condition,
          occupancy,
          price,
          current_deposit,
          current_rent,
          suggested_deposit,
          suggested_rent,
          capital,
          deposit,
          rent,
          family_status,
          family_size,
          notes,
          amenities,
          follow_up_days,
          follow_up_at,
          created_by,
          updated_by,
          status
        )
        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, 'active'
        )
        `
      )
      .bind(
        code,
        data.type,
        data.name,
        data.phone,
        data.location,
        data.propertyType,
        data.area,
        data.rooms,
        data.year,
        data.keyHolder,
        data.condition,
        data.occupancy,
        data.price,
        data.currentDeposit,
        data.currentRent,
        data.suggestedDeposit,
        data.suggestedRent,
        data.capital,
        data.deposit,
        data.rent,
        data.familyStatus,
        data.familySize,
        data.notes,
        JSON.stringify(data.amenities),
        data.followUpDays,
        followUpAt,
        user.id,
        user.id
      )
      .run();
  } catch (error) {
    console.error("Create file error:", error);

    return json(
      {
        ok: false,
        error: "ذخیره فایل انجام نشد. دوباره تلاش کنید.",
      },
      500,
      request,
      env
    );
  }

  const created = await env.DB
    .prepare(
      `
      SELECT
        f.*,
        creator.username AS created_by_username,
        creator.name AS created_by_name
      FROM files f
      LEFT JOIN users creator
        ON creator.id = f.created_by
      WHERE f.code = ?
      LIMIT 1
      `
    )
    .bind(code)
    .first();

  return json(
    {
      ok: true,
      file: serializeFile(created),
    },
    201,
    request,
    env
  );
}


// =========================================================
// Files — UPDATE
// =========================================================

async function handleUpdateFile(
  request,
  env,
  user,
  fileId
) {
  const existing = await getFileById(
    env.DB,
    fileId
  );

  if (!existing) {
    return json(
      {
        ok: false,
        error: "فایل پیدا نشد.",
      },
      404,
      request,
      env
    );
  }

  if (existing.status !== "active") {
    return json(
      {
        ok: false,
        error: "این فایل بایگانی شده است.",
      },
      400,
      request,
      env
    );
  }

  if (!canEditFile(user, existing)) {
    return json(
      {
        ok: false,
        error: "شما اجازه ویرایش این فایل را ندارید.",
      },
      403,
      request,
      env
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        ok: false,
        error: "اطلاعات فایل نامعتبر است.",
      },
      400,
      request,
      env
    );
  }

  const validation = validateFile(body);

  if (!validation.ok) {
    return json(
      {
        ok: false,
        error: validation.error,
      },
      400,
      request,
      env
    );
  }

  const data = validation.data;

  const followUpAt = calculateFollowUpDate(
    data.followUpDays
  );

  try {
    await env.DB
      .prepare(
        `
        UPDATE files
        SET
          type = ?,
          name = ?,
          phone = ?,
          location = ?,
          property_type = ?,
          area = ?,
          rooms = ?,
          year = ?,
          key_holder = ?,
          condition = ?,
          occupancy = ?,
          price = ?,
          current_deposit = ?,
          current_rent = ?,
          suggested_deposit = ?,
          suggested_rent = ?,
          capital = ?,
          deposit = ?,
          rent = ?,
          family_status = ?,
          family_size = ?,
          notes = ?,
          amenities = ?,
          follow_up_days = ?,
          follow_up_at = ?,
          updated_by = ?
        WHERE id = ?
        `
      )
      .bind(
        data.type,
        data.name,
        data.phone,
        data.location,
        data.propertyType,
        data.area,
        data.rooms,
        data.year,
        data.keyHolder,
        data.condition,
        data.occupancy,
        data.price,
        data.currentDeposit,
        data.currentRent,
        data.suggestedDeposit,
        data.suggestedRent,
        data.capital,
        data.deposit,
        data.rent,
        data.familyStatus,
        data.familySize,
        data.notes,
        JSON.stringify(data.amenities),
        data.followUpDays,
        followUpAt,
        user.id,
        fileId
      )
      .run();
  } catch (error) {
    console.error("Update file error:", error);

    return json(
      {
        ok: false,
        error: "ویرایش فایل انجام نشد.",
      },
      500,
      request,
      env
    );
  }

  const updated = await getFileById(
    env.DB,
    fileId
  );

  return json(
    {
      ok: true,
      file: serializeFile(updated),
    },
    200,
    request,
    env
  );
}


// =========================================================
// Files — DELETE / ARCHIVE
// =========================================================

async function handleDeleteFile(
  request,
  env,
  user,
  fileId
) {
  if (user.role !== "admin") {
    return json(
      {
        ok: false,
        error: "فقط مدیر می‌تواند فایل را حذف کند.",
      },
      403,
      request,
      env
    );
  }

  const existing = await getFileById(
    env.DB,
    fileId
  );

  if (!existing) {
    return json(
      {
        ok: false,
        error: "فایل پیدا نشد.",
      },
      404,
      request,
      env
    );
  }

  if (existing.status === "archived") {
    return json(
      {
        ok: false,
        error: "این فایل قبلاً بایگانی شده است.",
      },
      400,
      request,
      env
    );
  }

  await env.DB
    .prepare(
      `
      UPDATE files
      SET
        status = 'archived',
        updated_by = ?
      WHERE id = ?
      `
    )
    .bind(
      user.id,
      fileId
    )
    .run();

  return json(
    {
      ok: true,
    },
    200,
    request,
    env
  );
}


// =========================================================
// File helpers
// =========================================================

async function getFileById(db, id) {
  return await db
    .prepare(
      `
      SELECT
        f.*,
        creator.username AS created_by_username,
        creator.name AS created_by_name,
        updater.username AS updated_by_username,
        updater.name AS updated_by_name
      FROM files f
      LEFT JOIN users creator
        ON creator.id = f.created_by
      LEFT JOIN users updater
        ON updater.id = f.updated_by
      WHERE f.id = ?
      LIMIT 1
      `
    )
    .bind(id)
    .first();
}


function canEditFile(user, file) {
  if (user.role === "admin") {
    return true;
  }

  return (
    user.role === "consultant" &&
    Number(file.created_by) === Number(user.id)
  );
}


function serializeFile(row) {
  if (!row) {
    return null;
  }

  let amenities = [];

  try {
    if (row.amenities) {
      const parsed = JSON.parse(row.amenities);

      if (Array.isArray(parsed)) {
        amenities = parsed;
      }
    }
  } catch {
    amenities = [];
  }

  const now = Date.now();
  const followUpTimestamp = row.follow_up_at
    ? new Date(row.follow_up_at).getTime()
    : null;

  const needsFollowUp =
    followUpTimestamp !== null &&
    Number.isFinite(followUpTimestamp) &&
    followUpTimestamp <= now &&
    row.status === "active";

  return {
    id: row.id,
    code: row.code,

    type: row.type,
    name: row.name,
    phone: row.phone,

    location: row.location,
    propertyType: row.property_type,

    area: nullableNumber(row.area),
    rooms: nullableNumber(row.rooms),
    year: nullableNumber(row.year),

    keyHolder: row.key_holder,
    condition: row.condition,
    occupancy: row.occupancy,

    price: nullableNumber(row.price),

    currentDeposit: nullableNumber(
      row.current_deposit
    ),

    currentRent: nullableNumber(
      row.current_rent
    ),

    suggestedDeposit: nullableNumber(
      row.suggested_deposit
    ),

    suggestedRent: nullableNumber(
      row.suggested_rent
    ),

    capital: nullableNumber(row.capital),

    deposit: nullableNumber(row.deposit),
    rent: nullableNumber(row.rent),

    familyStatus: row.family_status,
    familySize: nullableNumber(row.family_size),

    notes: row.notes,

    amenities,

    followUpDays: Number(row.follow_up_days || 10),
    followUpAt: row.follow_up_at,

    needsFollowUp,

    createdBy: nullableNumber(row.created_by),
    createdByUsername: row.created_by_username,
    createdByName: row.created_by_name,

    updatedBy: nullableNumber(row.updated_by),
    updatedByUsername: row.updated_by_username,
    updatedByName: row.updated_by_name,

    createdAt: row.created_at,
    updatedAt: row.updated_at,

    status: row.status,
  };
}


// =========================================================
// Validation
// =========================================================

function validateFile(input) {
  if (!input || typeof input !== "object") {
    return {
      ok: false,
      error: "اطلاعات فایل نامعتبر است.",
    };
  }

  const type = cleanString(input.type, 30);

  if (!ALLOWED_FILE_TYPES.has(type)) {
    return {
      ok: false,
      error: "نوع فایل نامعتبر است.",
    };
  }

  const name = cleanString(input.name, 200);

  if (!name) {
    return {
      ok: false,
      error: "نام الزامی است.",
    };
  }

  const phone = cleanString(input.phone, 30);
  const location = cleanString(input.location, 500);

  const propertyType =
    input.propertyType === null ||
    input.propertyType === undefined ||
    input.propertyType === ""
      ? null
      : cleanString(input.propertyType, 30);

  if (
    propertyType !== null &&
    !PROPERTY_TYPES.has(propertyType)
  ) {
    return {
      ok: false,
      error: "نوع ملک نامعتبر است.",
    };
  }

  const area = numberOrNull(
    input.area,
    0,
    100000000
  );

  if (area === false) {
    return {
      ok: false,
      error: "متراژ نامعتبر است.",
    };
  }

  const rooms = integerOrNull(
    input.rooms,
    0,
    100
  );

  if (rooms === false) {
    return {
      ok: false,
      error: "تعداد اتاق نامعتبر است.",
    };
  }

  const year = integerOrNull(
    input.year,
    0,
    3000
  );

  if (year === false) {
    return {
      ok: false,
      error: "سال ساخت نامعتبر است.",
    };
  }

  const keyHolder =
    nullableEnum(
      input.keyHolder,
      KEY_HOLDERS
    );

  if (keyHolder === false) {
    return {
      ok: false,
      error: "وضعیت کلید نامعتبر است.",
    };
  }

  const condition =
    nullableEnum(
      input.condition,
      CONDITIONS
    );

  if (condition === false) {
    return {
      ok: false,
      error: "وضعیت ملک نامعتبر است.",
    };
  }

  const occupancy =
    nullableEnum(
      input.occupancy,
      OCCUPANCIES
    );

  if (occupancy === false) {
    return {
      ok: false,
      error: "وضعیت سکونت نامعتبر است.",
    };
  }

  const price = moneyOrNull(input.price);
  const currentDeposit = moneyOrNull(
    input.currentDeposit
  );
  const currentRent = moneyOrNull(
    input.currentRent
  );
  const suggestedDeposit = moneyOrNull(
    input.suggestedDeposit
  );
  const suggestedRent = moneyOrNull(
    input.suggestedRent
  );
  const capital = moneyOrNull(input.capital);
  const deposit = moneyOrNull(input.deposit);
  const rent = moneyOrNull(input.rent);

  if (
    [
      price,
      currentDeposit,
      currentRent,
      suggestedDeposit,
      suggestedRent,
      capital,
      deposit,
      rent,
    ].some(value => value === false)
  ) {
    return {
      ok: false,
      error: "یکی از مبالغ واردشده نامعتبر است.",
    };
  }

  const familyStatus =
    nullableEnum(
      input.familyStatus,
      FAMILY_STATUSES
    );

  if (familyStatus === false) {
    return {
      ok: false,
      error: "وضعیت تأهل نامعتبر است.",
    };
  }

  const familySize = integerOrNull(
    input.familySize,
    0,
    100
  );

  if (familySize === false) {
    return {
      ok: false,
      error: "تعداد اعضای خانواده نامعتبر است.",
    };
  }

  const notes =
    input.notes === null ||
    input.notes === undefined
      ? null
      : cleanString(input.notes, 5000);

  const amenitiesResult =
    normalizeAmenities(input.amenities);

  if (!amenitiesResult.ok) {
    return amenitiesResult;
  }

  let followUpDays =
    input.followUpDays === null ||
    input.followUpDays === undefined ||
    input.followUpDays === ""
      ? 10
      : Number(input.followUpDays);

  if (
    !Number.isInteger(followUpDays) ||
    followUpDays < 1 ||
    followUpDays > 365
  ) {
    return {
      ok: false,
      error: "مدت پیگیری باید بین ۱ تا ۳۶۵ روز باشد.",
    };
  }

  return {
    ok: true,

    data: {
      type,
      name,
      phone: phone || null,
      location: location || null,
      propertyType,

      area,
      rooms,
      year,

      keyHolder,
      condition,
      occupancy,

      price,
      currentDeposit,
      currentRent,
      suggestedDeposit,
      suggestedRent,

      capital,

      deposit,
      rent,

      familyStatus,
      familySize,

      notes: notes || null,

      amenities: amenitiesResult.amenities,

      followUpDays,
    },
  };
}


// =========================================================
// Validation helpers
// =========================================================

function cleanString(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .replace(/\u0000/g, "")
    .slice(0, maxLength);
}


function numberOrNull(value, min, max) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number < min ||
    number > max
  ) {
    return false;
  }

  return number;
}


function moneyOrNull(value) {
  return numberOrNull(
    value,
    0,
    1000000000000000
  );
}


function integerOrNull(value, min, max) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  if (
    !Number.isInteger(number) ||
    number < min ||
    number > max
  ) {
    return false;
  }

  return number;
}


function nullableEnum(value, allowed) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const clean = cleanString(value, 50);

  return allowed.has(clean)
    ? clean
    : false;
}


function normalizeAmenities(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return {
      ok: true,
      amenities: [],
    };
  }

  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: "امکانات نامعتبر است.",
    };
  }

  if (value.length > 30) {
    return {
      ok: false,
      error: "تعداد امکانات بیش از حد مجاز است.",
    };
  }

  const result = [];

  for (const item of value) {
    if (typeof item !== "string") {
      return {
        ok: false,
        error: "امکانات نامعتبر است.",
      };
    }

    const clean = cleanString(item, 50);

    if (!AMENITIES.has(clean)) {
      return {
        ok: false,
        error: "یکی از امکانات نامعتبر است.",
      };
    }

    if (!result.includes(clean)) {
      result.push(clean);
    }
  }

  return {
    ok: true,
    amenities: result,
  };
}


// =========================================================
// Follow-up
// =========================================================

function calculateFollowUpDate(days) {
  return new Date(
    Date.now() +
      Number(days) *
        24 *
        60 *
        60 *
        1000
  ).toISOString();
}


// =========================================================
// File code generation
// =========================================================

async function getNextFileCode(db) {
  try {
    /*
     * We create a dedicated counter table.
     * This avoids relying on MAX(code), which can collide
     * when two consultants create files at the same time.
     */

    await db
      .prepare(
        `
        CREATE TABLE IF NOT EXISTS file_sequences (
          name TEXT PRIMARY KEY,
          value INTEGER NOT NULL
        )
        `
      )
      .run();

    const result = await db
      .prepare(
        `
        INSERT INTO file_sequences (
          name,
          value
        )
        VALUES ('files', 1)

        ON CONFLICT(name)
        DO UPDATE SET
          value = file_sequences.value + 1

        RETURNING value
        `
      )
      .first();

    if (
      !result ||
      !Number.isInteger(Number(result.value))
    ) {
      return null;
    }

    return Number(result.value);
  } catch (error) {
    console.error(
      "Sequence error:",
      error
    );

    /*
     * Fallback for an existing database where old codes
     * already exist but the sequence table is new.
     */

    try {
      const max = await db
        .prepare(
          `
          SELECT COALESCE(
            MAX(code),
            0
          ) AS max_code
          FROM files
          `
        )
        .first();

      return (
        Number(max?.max_code || 0) + 1
      );
    } catch {
      return null;
    }
  }
}


// =========================================================
// Password hashing
// =========================================================

async function verifyPassword(
  password,
  storedHash
) {
  if (
    typeof storedHash !== "string" ||
    !storedHash
  ) {
    return false;
  }

  const parts = storedHash.split("$");

  if (parts.length !== 4) {
    return false;
  }

  const algorithm = parts[0];
  const iterations = Number(parts[1]);
  const saltBase64 = parts[2];
  const expectedBase64 = parts[3];

  if (
    algorithm !== "pbkdf2_sha256" ||
    !Number.isInteger(iterations) ||
    iterations < 100000 ||
    iterations > 1000000
  ) {
    return false;
  }

  try {
    const salt = base64ToBytes(saltBase64);
    const expected = base64ToBytes(
      expectedBase64
    );

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      {
        name: "PBKDF2",
      },
      false,
      ["deriveBits"]
    );

    const derivedBits =
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt,
          iterations,
          hash: "SHA-256",
        },
        key,
        expected.length * 8
      );

    const actual = new Uint8Array(
      derivedBits
    );

    return timingSafeEqual(
      actual,
      expected
    );
  } catch {
    return false;
  }
}


// =========================================================
// Crypto helpers
// =========================================================

function randomToken(bytesLength) {
  const bytes = new Uint8Array(
    bytesLength
  );

  crypto.getRandomValues(bytes);

  return bytesToBase64Url(bytes);
}


async function sha256(value) {
  const data =
    new TextEncoder().encode(value);

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return bytesToHex(
    new Uint8Array(hash)
  );
}


function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }

  return result === 0;
}


function bytesToBase64Url(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


function bytesToBase64(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}


function base64ToBytes(value) {
  const binary = atob(value);

  const bytes = new Uint8Array(
    binary.length
  );

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}


function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(byte =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}


// =========================================================
// Cookies
// =========================================================

function getCookie(request, name) {
  const cookieHeader =
    request.headers.get("Cookie");

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader
    .split(";")
    .map(part => part.trim());

  for (const cookie of cookies) {
    const index = cookie.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key =
      cookie.slice(0, index);

    const value =
      cookie.slice(index + 1);

    if (key === name) {
      return decodeURIComponent(value);
    }
  }

  return null;
}


function buildSessionCookie(
  token,
  days
) {
  const maxAge =
    days * 24 * 60 * 60;

  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=None",
    `Max-Age=${maxAge}`,
  ].join("; ");
}


function clearSessionCookie() {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=None",
    "Max-Age=0",
  ].join("; ");
}


// =========================================================
// CORS / Origin protection
// =========================================================

function corsHeaders(request, env) {
  const headers = new Headers();

  const allowedOrigin =
    env.ALLOWED_ORIGIN;

  const requestOrigin =
    request.headers.get("Origin");

  if (
    allowedOrigin &&
    requestOrigin === allowedOrigin
  ) {
    headers.set(
      "Access-Control-Allow-Origin",
      allowedOrigin
    );

    headers.set(
      "Access-Control-Allow-Credentials",
      "true"
    );

    headers.set(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,DELETE,OPTIONS"
    );

    headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type"
    );

    headers.set(
      "Access-Control-Max-Age",
      "86400"
    );

    headers.set(
      "Vary",
      "Origin"
    );
  }

  headers.set(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  headers.set(
    "Cache-Control",
    "no-store"
  );

  return headers;
}


function checkOrigin(request, env) {
  const allowedOrigin =
    env.ALLOWED_ORIGIN;

  const origin =
    request.headers.get("Origin");

  if (!allowedOrigin || !origin) {
    return false;
  }

  return origin === allowedOrigin;
}


// =========================================================
// JSON response
// =========================================================

function json(
  data,
  status,
  request,
  env
) {
  const headers =
    corsHeaders(request, env);

  return new Response(
    JSON.stringify(data),
    {
      status,
      headers,
    }
  );
}


// =========================================================
// Public user
// =========================================================

function publicUser(user) {
  return {
    id: Number(user.id),
    username: user.username,
    role: user.role,
    name: user.name || user.username,
    active:
      Number(user.active ?? 1) === 1,
  };
}


// =========================================================
// Session cleanup
// =========================================================

async function cleanupExpiredSessions(db) {
  try {
    await db
      .prepare(
        `
        DELETE FROM sessions
        WHERE expires_at <= ?
        `
      )
      .bind(
        new Date().toISOString()
      )
      .run();
  } catch (error) {
    console.error(
      "Session cleanup error:",
      error
    );
  }
}


// =========================================================
// Simple login rate limiter
// =========================================================
//
// This is an additional layer.
// Cloudflare's edge protections should also be enabled.
// The Map is isolate-local, so it is intentionally not
// treated as the only security mechanism.
//

const failedLogins = new Map();

const LOGIN_WINDOW_MS =
  10 * 60 * 1000;

const MAX_LOGIN_ATTEMPTS = 8;


function isRateLimited(ip) {
  const record =
    failedLogins.get(ip);

  if (!record) {
    return false;
  }

  if (
    Date.now() - record.startedAt >
    LOGIN_WINDOW_MS
  ) {
    failedLogins.delete(ip);
    return false;
  }

  return (
    record.count >=
    MAX_LOGIN_ATTEMPTS
  );
}


function registerFailedLogin(ip) {
  const now = Date.now();

  const existing =
    failedLogins.get(ip);

  if (
    !existing ||
    now - existing.startedAt >
      LOGIN_WINDOW_MS
  ) {
    failedLogins.set(ip, {
      startedAt: now,
      count: 1,
    });

    return;
  }

  existing.count += 1;
}


function clearFailedLogins(ip) {
  failedLogins.delete(ip);
}


// =========================================================
// Numeric helper
// =========================================================

function nullableNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}
