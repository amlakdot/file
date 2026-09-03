/* =========================================================
   LABELS
========================================================= */

export const TYPE_LABELS = {
  sale: "ملک فروشی",
  landlord: "مالک / موجر",
  buyer: "خریدار",
  tenant: "مستاجر"
};

export const PROPERTY_TYPE_LABELS = {
  apartment: "آپارتمان",
  villa: "ویلا",
  office: "دفتر / اداری",
  commercial: "تجاری",
  land: "زمین",
  garden: "باغ",
  any: "فرقی ندارد"
};

export const KEY_HOLDER_LABELS = {
  owner: "مالک",
  tenant: "مستاجر",
  guard: "نگهبان",
  office: "دفتر",
  other: "سایر"
};

export const CONDITION_LABELS = {
  new: "نوساز",
  unused: "کلید نخورده",
  renovated: "بازسازی‌شده",
  "not-renovated": "بازسازی‌نشده",
  renovating: "در حال بازسازی"
};

export const OCCUPANCY_LABELS = {
  empty: "خالی",
  tenant: "مستاجر",
  owner: "مالک ساکن",
  evacuating: "در حال تخلیه"
};

export const FAMILY_LABELS = {
  single: "مجرد",
  married: "متأهل",
  family: "خانوادگی"
};

export const AMENITY_LABELS = {
  parking: "پارکینگ",
  elevator: "آسانسور",
  storage: "انباری",
  balcony: "بالکن",
  terrace: "تراس",
  yard: "حیاط",
  pool: "استخر",
  jacuzzi: "جکوزی",
  roof: "روف",
  lobby: "لابی",
  guard: "نگهبان",
  package: "پکیج",
  cooler: "کولر",
  "floor-heating": "گرمایش از کف",
  cabinet: "کابینت",
  closet: "کمد"
};

export function getStatusColor(status) {
  const colors = {
    active: "#55b878",
    pending: "#e3a93f",
    archived: "#727a82",
    done: "#55b878",
    followup: "#e05252"
  };
  return colors[status] || "#aeb5bb";
}

export function getStatusLabel(status) {
  const labels = {
    active: "فعال",
    pending: "در انتظار",
    archived: "بایگانی",
    done: "انجام شده",
    followup: "نیاز به پیگیری"
  };
  return labels[status] || status;
}
