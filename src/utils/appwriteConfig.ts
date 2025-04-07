
/**
 * APPWRITE DATABASE CONFIGURATION
 * 
 * This file contains the detailed configuration for MomCare AI app's Appwrite backend.
 * It defines collection schemas, attributes, and relationships.
 */

// Appwrite Project Details
export const appwriteConfig = {
  endpoint: 'https://cloud.appwrite.io/v1',
  projectId: '67eedd2200263ded93ad',
  databaseId: '67eedd70002e29e2de80',
  collections: {
    profiles: {
      name: 'User Profiles',
      attributes: [
        { key: 'userId', type: 'string', required: true, size: 255, array: false },
        { key: 'name', type: 'string', required: false, size: 255, array: false },
        { key: 'age', type: 'integer', required: false, min: 0, max: 120, array: false },
        { key: 'gender', type: 'string', required: false, size: 50, array: false },
        { key: 'address', type: 'string', required: false, size: 1000, array: false },
        { key: 'weeksPregnant', type: 'integer', required: false, min: 0, max: 45, array: false },
        { key: 'preExistingConditions', type: 'string', required: false, size: 2000, array: false },
        { key: 'phoneNumber', type: 'string', required: false, size: 50, array: false },
        { key: 'profilePhotoId', type: 'string', required: false, size: 255, array: false },
        { key: 'weeksPregnant', type: 'integer', required: false, min: 0, max: 45, array: false, description: 'Estimated weeks of pregnancy' },
        { key: 'preExistingConditions', type: 'string', required: false, size: 2000, array: false, description: 'List of pre-existing conditions' },
        { key: 'previousPregnancies', type: 'integer', required: false, min: 0, max: 20, array: false, description: 'Number of previous pregnancies' },
        { key: 'deliveryPreference', type: 'string', required: false, size: 50, array: false, description: 'e.g., vaginal, c-section, undecided' },
        { key: 'partnerSupport', type: 'string', required: false, size: 100, array: false, description: 'Level of partner support (optional, sensitive)' },
        { key: 'workSituation', type: 'string', required: false, size: 100, array: false, description: 'e.g., full-time, part-time, on leave' },
        { key: 'dietaryPreferences', type: 'string', required: false, size: 100, array: true, description: 'List of dietary needs/prefs (e.g., vegetarian)' },
        { key: 'activityLevel', type: 'string', required: false, size: 50, array: false, description: 'e.g., sedentary, light, moderate, active' },
        { key: 'chatTonePreference', type: 'string', required: false, size: 50, array: false, description: 'Preferred AI chat tone (e.g., empathetic, direct)' },
      ],
      indexes: [
        { key: 'userId_idx', type: 'key', attributes: ['userId'], orders: ['ASC'] },
      ],
    },
    appointments: {
      name: 'User Appointments',
      attributes: [
        { key: 'userId', type: 'string', required: true, size: 255, array: false },
        { key: 'date', type: 'string', required: true, size: 255, array: false },
        { key: 'time', type: 'string', required: true, size: 255, array: false },
        { key: 'notes', type: 'string', required: false, size: 2000, array: false },
        { key: 'isCompleted', type: 'boolean', required: false, default: false, array: false },
      ],
      indexes: [
        { key: 'userId_idx', type: 'key', attributes: ['userId'], orders: ['ASC'] },
        { key: 'date_idx', type: 'key', attributes: ['date'], orders: ['ASC'] },
      ],
    },
    medicalDocuments: {
      name: 'Medical Documents',
      attributes: [
        { key: 'userId', type: 'string', required: true, size: 255, array: false },
        { key: 'fileId', type: 'string', required: true, size: 255, array: false },
        { key: 'fileName', type: 'string', required: true, size: 255, array: false },
        { key: 'documentType', type: 'string', required: false, size: 255, array: false },
        { key: 'description', type: 'string', required: false, size: 1000, array: false },
      ],
      indexes: [
        { key: 'userId_idx', type: 'key', attributes: ['userId'], orders: ['ASC'] },
      ],
    },
    blogs: {
      name: 'Blog Posts',
      attributes: [
        { key: 'title', type: 'string', required: true, size: 255, array: false },
        { key: 'content', type: 'string', required: true, size: 16777216, array: false }, // 16MB text
        { key: 'author', type: 'string', required: true, size: 255, array: false },
        { key: 'category', type: 'string', required: false, size: 255, array: false },
        { key: 'imageUrl', type: 'string', required: false, size: 1024, array: false },
        { key: 'tags', type: 'string', required: false, size: 255, array: true },
        { key: 'publishedAt', type: 'datetime', required: false, array: false },
      ],
      indexes: [
        { key: 'category_idx', type: 'key', attributes: ['category'], orders: ['ASC'] },
        { key: 'published_idx', type: 'key', attributes: ['publishedAt'], orders: ['DESC'] },
      ],
    },
  },
  buckets: {
    profileBucket: {
      id: '67eedd95001c9f649452',
      name: 'Profile Photos',
      maximumFileSize: 5242880, // 5MB
      allowedFileExtensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    },
    medicalBucket: {
      id: '67eedd4c000fd9e5ae28',
      name: 'Medical Documents',
      maximumFileSize: 10485760, // 10MB
      allowedFileExtensions: ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx'],
    },
  }
};

/**
 * Appwrite Permissions Guide:
 * 
 * For collections that store user data, you'll want to set up the following permissions:
 * 
 * 1. Document Level:
 *    - Read: Only the document owner (user) should be able to read their documents
 *    - Write: Only the document owner should be able to update their documents
 *    - Delete: Only the document owner should be able to delete their documents
 * 
 * 2. Collection Level:
 *    - Create: Authenticated users should be able to create documents in the collection
 *    - Read: Limited to document owners only (using RLS)
 * 
 * The Database Security Rules can be set in the Appwrite Console under:
 * Database > [Your Database] > [Collection] > Settings > Rules
 * 
 * Example Rule for user-specific data (profiles, appointments, etc.):
 * - For Read operations: document.userId == user.id
 * - For Write operations: document.userId == user.id
 * - For Delete operations: document.userId == user.id
 * 
 * For blog posts that are public:
 * - For Read operations: public access (no conditions)
 * - For Write operations: role == 'admin' (only admins can write)
 */

export default appwriteConfig;
