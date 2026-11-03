const blankToNull = (value) => (value === "" || value === undefined ? null : value);

export const profile = {
  fromRow(authUser, row, isAdmin = false) {
    return {
      id: authUser.id,
      email: authUser.email,
      joined: authUser.created_at,
      name: row?.name || authUser.email.split("@")[0],
      bio: row?.bio || "",
      region: row?.region || "",
      phone: row?.phone || "",
      phoneCode: row?.phone_code || "+233",
      emailVisibility: row?.email_visibility || "private",
      phoneVisibility: row?.phone_visibility || "private",
      avatar: row?.avatar || null,
      prefs: row?.prefs || {},
      isAdmin,
    };
  },
  toRow(changes) {
    const columns = {
      name: "name",
      bio: "bio",
      region: "region",
      phone: "phone",
      phoneCode: "phone_code",
      emailVisibility: "email_visibility",
      phoneVisibility: "phone_visibility",
      avatar: "avatar",
      prefs: "prefs",
    };
    const row = {};
    Object.entries(changes).forEach(([key, value]) => {
      if (columns[key]) row[columns[key]] = blankToNull(value);
    });
    if (row.name === null) delete row.name;
    if (row.phone_code === null) delete row.phone_code;
    return row;
  },
};

export const trip = {
  fromRow(row) {
    return {
      id: row.id,
      name: row.name,
      start: row.start_date,
      end: row.end_date,
      travellers: row.travellers,
      budget: row.budget,
      stops: row.stops,
      status: row.status,
      created: row.created_at,
    };
  },
  toRow(value) {
    return {
      name: value.name,
      start_date: blankToNull(value.start),
      end_date: blankToNull(value.end),
      travellers: value.travellers,
      budget: value.budget || null,
      stops: value.stops,
      status: value.start ? "planned" : "draft",
    };
  },
};

export const booking = {
  fromRow(row) {
    return {
      id: row.id,
      hotelId: row.hotel_id,
      checkIn: row.check_in,
      checkOut: row.check_out,
      guests: row.guests,
      status: row.status,
      created: row.created_at,
    };
  },
  toRow(value) {
    return {
      hotel_id: value.hotelId,
      check_in: value.checkIn,
      check_out: value.checkOut,
      guests: value.guests,
    };
  },
};

export const message = {
  columns: "id, user_id, author_name, body, created_at",
  fromRow(row, myId) {
    return {
      id: row.id,
      who: row.author_name,
      text: row.body,
      at: row.created_at,
      mine: Boolean(myId) && row.user_id === myId,
    };
  },
};

export const room = {
  fromRow(row, joined, last) {
    return {
      id: row.id,
      name: row.name,
      initials: row.initials,
      groups: row.groups,
      members: row.members,
      joined,
      last,
    };
  },
};

export const place = {
  fromRow(row) {
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      region: row.region,
      where: row.area,
      rating: Number(row.rating),
      reviews: row.reviews,
      image: row.image,
      imageAlt: row.image_alt,
      gallery: row.gallery,
      about: row.about,
      facts: row.facts,
      stay: { hotel: row.stay_hotel, note: row.stay_note },
      related: row.related,
      map: { x: Number(row.map_x), y: Number(row.map_y) },
      featured: row.featured,
      hidden: Boolean(row.hidden),
      updated: row.updated_at || null,
    };
  },
  toRow(value) {
    return {
      id: value.id,
      name: value.name,
      category: value.category,
      region: value.region,
      area: value.where,
      rating: value.rating,
      reviews: value.reviews,
      image: value.image,
      image_alt: value.imageAlt,
      gallery: value.gallery,
      about: value.about,
      facts: value.facts,
      stay_hotel: blankToNull(value.stay.hotel),
      stay_note: blankToNull(value.stay.note),
      related: value.related,
      map_x: value.map.x,
      map_y: value.map.y,
      featured: value.featured,
      hidden: value.hidden,
    };
  },
};

export const hotel = {
  fromRow(row) {
    return {
      id: row.id,
      name: row.name,
      area: row.area,
      region: row.region,
      price: row.price,
      rating: Number(row.rating),
      amenities: row.amenities,
      image: row.image,
      hidden: Boolean(row.hidden),
      updated: row.updated_at || null,
    };
  },
  toRow(value) {
    return {
      id: value.id,
      name: value.name,
      area: value.area,
      region: value.region,
      price: value.price,
      rating: value.rating,
      amenities: value.amenities,
      image: blankToNull(value.image),
      hidden: value.hidden,
    };
  },
};
