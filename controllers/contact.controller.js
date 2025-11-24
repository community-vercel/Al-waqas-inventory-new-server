const Contact = require('../models/contact.model');
const asyncHandler = require('express-async-handler');

// @desc    Get all contacts with filtering and pagination
// @route   GET /api/contacts
// @access  Private
const getContacts = asyncHandler(async (req, res) => {
  const {
    type,
    search,
    page = 1,
    limit = 10,
    sortBy = 'name',
    sortOrder = 'asc'
  } = req.query;

  // Build filter object
  const filter = { isActive: true };
  
  if (type && ['customer', 'supplier'].includes(type)) {
    filter.type = type;
  }

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { address: { $regex: search, $options: 'i' } }
    ];
  }

  // Sort configuration
  const sortConfig = {};
  sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

  // Execute query with pagination
  const contacts = await Contact.find(filter)
    .sort(sortConfig)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .select('-__v');

  const total = await Contact.countDocuments(filter);

  res.json({
    success: true,
    data: contacts,
    pagination: {
      current: parseInt(page),
      pages: Math.ceil(total / limit),
      total
    }
  });
});

// @desc    Get single contact
// @route   GET /api/contacts/:id
// @access  Private
const getContact = asyncHandler(async (req, res) => {
  const contact = await Contact.findById(req.params.id);

  if (!contact || !contact.isActive) {
    res.status(404);
    throw new Error('Contact not found');
  }

  res.json({
    success: true,
    data: contact
  });
});

// @desc    Create new contact
// @route   POST /api/contacts
// @access  Private
const createContact = asyncHandler(async (req, res) => {
  const { name, type, phone, address, email, balance } = req.body;

  // Check if contact already exists with same name and type
  const existingContact = await Contact.findOne({ 
    name: { $regex: new RegExp(`^${name}$`, 'i') }, 
    type,
    isActive: true 
  });

  if (existingContact) {
    res.status(400);
    throw new Error(`A ${type} with this name already exists`);
  }

  const contact = await Contact.create({
    name,
    type,
    phone,
    address,
    email,
    balance: balance || 0
  });

  res.status(201).json({
    success: true,
    message: 'Contact created successfully',
    data: contact
  });
});

// @desc    Update contact
// @route   PUT /api/contacts/:id
// @access  Private
const updateContact = asyncHandler(async (req, res) => {
  const { name, type, phone, address, email, balance, isActive } = req.body;

  let contact = await Contact.findById(req.params.id);

  if (!contact) {
    res.status(404);
    throw new Error('Contact not found');
  }

  // Check for duplicate name when updating
  if (name && name !== contact.name) {
    const duplicate = await Contact.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') }, 
      type: type || contact.type,
      _id: { $ne: req.params.id },
      isActive: true 
    });

    if (duplicate) {
      res.status(400);
      throw new Error(`A ${type || contact.type} with this name already exists`);
    }
  }

  contact = await Contact.findByIdAndUpdate(
    req.params.id,
    {
      name,
      type,
      phone,
      address,
      email,
      balance,
      isActive
    },
    {
      new: true,
      runValidators: true
    }
  );

  res.json({
    success: true,
    message: 'Contact updated successfully',
    data: contact
  });
});

// @desc    Delete contact (soft delete)
// @route   DELETE /api/contacts/:id
// @access  Private
const deleteContact = asyncHandler(async (req, res) => {
  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    res.status(404);
    throw new Error('Contact not found');
  }

  // Soft delete by setting isActive to false
  contact.isActive = false;
  await contact.save();

  res.json({
    success: true,
    message: 'Contact deleted successfully'
  });
});

// @desc    Get contacts by type
// @route   GET /api/contacts/type/:type
// @access  Private
const getContactsByType = asyncHandler(async (req, res) => {
  const { type } = req.params;

  if (!['customer', 'supplier'].includes(type)) {
    res.status(400);
    throw new Error('Type must be either customer or supplier');
  }

  const contacts = await Contact.getByType(type);

  res.json({
    success: true,
    data: contacts
  });
});

// @desc    Search contacts
// @route   GET /api/contacts/search/:query
// @access  Private
const searchContacts = asyncHandler(async (req, res) => {
  const { query } = req.params;

  const contacts = await Contact.find({
    isActive: true,
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { phone: { $regex: query, $options: 'i' } }
    ]
  }).limit(10).select('name type phone balance');

  res.json({
    success: true,
    data: contacts
  });
});

module.exports = {
  getContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  getContactsByType,
  searchContacts
};