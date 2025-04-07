// src/lib/appwrite.ts
import {
    Account,
    Avatars,
    Client,
    Databases,
    ID,
    Query,
    Storage,
    Models, // Use Models namespace for Document type
    Permission,
    Role,
    AppwriteException
} from 'appwrite';

// --- Configuration ---
// Ensure your .env.local file (or environment variables) has these defined
// It's crucial these are correctly set for the application to connect to Appwrite.
const endpoint: string = import.meta.env.VITE_PUBLIC_APPWRITE_ENDPOINT as string;
const projectId: string = import.meta.env.VITE_PUBLIC_APPWRITE_PROJECT_ID as string;
const databaseId: string = import.meta.env.VITE_PUBLIC_APPWRITE_BLOG_DATABASE_ID as string; // Main DB ID

// --- Collection IDs ---
// Using descriptive names matching the purpose. Ensure these IDs exist in your Appwrite project.
const blogCollectionId: string = import.meta.env.VITE_PUBLIC_APPWRITE_BLOG_COLLECTION_ID as string; // For blog feature
const profilesCollectionId: string = import.meta.env.VITE_PUBLIC_APPWRITE_PROFILES_COLLECTION_ID as string;
const medicalDocumentsCollectionId: string = import.meta.env.VITE_PUBLIC_APPWRITE_MEDICAL_DOCUMENTS_COLLECTION_ID as string;
const appointmentsCollectionId: string = import.meta.env.VITE_PUBLIC_APPWRITE_APPOINTMENTS_COLLECTION_ID as string;
const bloodPressureCollectionId: string = import.meta.env.VITE_PUBLIC_APPWRITE_BP_COLLECTION_ID as string;
const bloodSugarCollectionId: string = import.meta.env.VITE_PUBLIC_APPWRITE_SUGAR_COLLECTION_ID as string;
const weightCollectionId: string = import.meta.env.VITE_PUBLIC_APPWRITE_WEIGHT_COLLECTION_ID as string;
const medicationRemindersCollectionId: string = import.meta.env.VITE_PUBLIC_APPWRITE_MEDS_COLLECTION_ID as string;

// --- Bucket IDs ---
// Ensure these Storage Buckets exist in your Appwrite project.
export const profileBucketId: string = import.meta.env.VITE_PUBLIC_APPWRITE_PROFILE_BUCKET_ID as string;
export const medicalBucketId: string = import.meta.env.VITE_PUBLIC_APPWRITE_MEDICAL_BUCKET_ID as string;
// Optional: Bucket for blog post images if you upload them directly
// You would need to define this environment variable if you use image uploads with deleteBlogPost
// export const blogImageBucketId: string = import.meta.env.VITE_PUBLIC_APPWRITE_BLOG_IMAGE_BUCKET_ID as string;

// --- Configuration Validation ---
// Checks if essential configuration variables are present and not placeholders.
const requiredConfigs: Record<string, string | undefined> = {
    endpoint,
    projectId,
    databaseId,
    blogCollectionId, // Make blog collection required if core feature
    profilesCollectionId,
    medicalDocumentsCollectionId,
    appointmentsCollectionId,
    bloodPressureCollectionId,
    bloodSugarCollectionId,
    weightCollectionId,
    medicationRemindersCollectionId,
    profileBucketId,
    medicalBucketId
    // Add blogImageBucketId here if it becomes required for your logic
};

const missingConfigs: string[] = Object.entries(requiredConfigs)
    // Basic check for undefined, null, empty string, or common placeholder prefixes
    .filter(([_, value]) => !value || value.startsWith('YOUR_') || value.startsWith('<') || value.length < 5)
    .map(([key]) => key);

if (missingConfigs.length > 0) {
    const errorMsg = `CRITICAL ERROR: Missing or invalid Appwrite configuration for: ${missingConfigs.join(', ')}. Check your environment variables (e.g., .env.local) and ensure all VITE_PUBLIC_APPWRITE_* variables are correctly set.`;
    console.error(errorMsg);
    // Throwing an error stops the app from potentially running incorrectly
    throw new Error(errorMsg);
} else {
    // console.log("Appwrite Config Loaded Successfully.");
    // For debugging: Log the loaded config values (excluding sensitive keys if any)
    // console.log("Appwrite Config Details:", { endpoint, projectId, databaseId, /* list other safe IDs */ });
}

// --- Appwrite Client Initialization ---
const client = new Client();
client.setEndpoint(endpoint).setProject(projectId);

// --- Service Exports ---
// Instantiated Appwrite services for use throughout the application.
export const account = new Account(client);
export const avatars = new Avatars(client);
export const databases = new Databases(client);
export const storage = new Storage(client);

// --- Type Definitions ---

/**
 * Base interface for Appwrite documents, using Models.Document for system attributes.
 * Includes $id, $createdAt, $updatedAt, $permissions, $collectionId, $databaseId
 */
export type AppwriteDocument = Models.Document;

/**
 * Represents a medication reminder document.
 */
export interface MedicationReminder extends AppwriteDocument {
    userId: string;
    medicationName: string;
    dosage: string;
    frequency: string; // e.g., "Daily", "Twice Daily", "As Needed"
    times?: string[]; // Array of times like "HH:MM" (optional)
    notes?: string; // Optional notes
    isActive?: boolean; // Reminder status (default: true)
}

/**
 * Represents a user profile document. Includes basic info, pregnancy details, and preferences.
 */
export interface UserProfile extends AppwriteDocument {
    userId: string; // Links to Appwrite Auth User $id (should be indexed)
    name?: string;
    profilePhotoId?: string; // File ID in profileBucketId
    profilePhotoUrl?: string; // Generated client-side string URL for display, NOT stored in DB
    age?: number;
    gender?: string;
    address?: string;
    weeksPregnant?: number; // Estimated weeks
    preExistingConditions?: string; // Text description
    email?: string; // User's email (can be useful for queries, maybe indexed)
    phoneNumber?: string;

    // Pregnancy History & Preferences
    previousPregnancies?: number; // Number of previous pregnancies
    deliveryPreference?: string;   // e.g., 'vaginal', 'c-section', 'undecided'

    // Lifestyle & Preferences
    partnerSupport?: string;       // e.g., 'very supportive', 'limited' (Optional, handle sensitively)
    workSituation?: string;        // e.g., 'full-time', 'on leave'
    dietaryPreferences?: string[]; // Array of strings, e.g., ['vegetarian', 'gluten-free']
    activityLevel?: string;        // e.g., 'sedentary', 'light', 'moderate', 'active'
    chatTonePreference?: string;   // Preferred AI chat tone (e.g., 'empathetic', 'direct')
}

/**
 * Represents a blog post document.
 */
export interface BlogPost extends AppwriteDocument {
    title: string;
    slug: string; // URL-friendly identifier (should have a UNIQUE index)
    content: string; // Can be large text/HTML/Markdown
    author: string; // Consider linking to UserProfile ($id or userId) or just store name
    category?: string; // Should be indexed for filtering
    imageUrl?: string; // URL of an external image OR generated preview URL from Appwrite Storage
    imageFileId?: string; // ID of the file in Appwrite Storage (if uploading images)
    tags?: string[]; // Array of strings (consider indexing if filtering by tags)
    publishedAt?: string; // ISO Datetime string (optional, can use $createdAt)
    // Add other fields as needed: isFeatured (boolean), readingTime (number), etc.
}

/**
 * Represents a medical document record linking a user to a file in storage.
 */
export interface MedicalDocument extends AppwriteDocument {
    userId: string; // Should be indexed
    fileId: string; // ID of the file in Appwrite Storage (medicalBucketId)
    fileName: string; // Original file name
    documentType?: string; // MIME type e.g., 'application/pdf', 'image/jpeg'
    description?: string; // Optional user description
}

/**
 * Represents an appointment document.
 */
export interface Appointment extends AppwriteDocument {
    userId: string; // Should be indexed
    date: string; // ISO Datetime string (YYYY-MM-DDTHH:mm:ss.sssZ) - Recommended for proper sorting/filtering (should be indexed)
    time: string; // Time string (e.g., "10:00 AM", "14:30") - Potentially redundant if 'date' includes time, but can be useful for display
    notes?: string;
    isCompleted?: boolean; // Should be indexed if filtering by status
    appointmentType?: string; // e.g., 'doctor', 'yoga_class', 'lab_test' (consider indexing)
}

// --- Health Reading Types ---

/** Base interface for health readings with common fields. */
interface HealthReadingBase extends AppwriteDocument {
    userId: string; // Should be indexed
    recordedAt: string; // ISO Datetime string when the reading was recorded (should be indexed)
}

/** Represents a blood pressure reading document. */
export interface BloodPressureReading extends HealthReadingBase {
    systolic: number;
    diastolic: number;
}

/** Represents a blood sugar reading document. */
export interface BloodSugarReading extends HealthReadingBase {
    level: number; // Use float for potential decimals
    measurementType: 'fasting' | 'post_meal' | 'random'; // Type of measurement (consider indexing)
}

/** Represents a weight reading document. */
export interface WeightReading extends HealthReadingBase {
    weight: number; // Use float
    unit: 'kg' | 'lbs'; // Unit of measurement
}

// --- Specific Input Types for Create Functions ---
// Define the shape of data expected from the UI *before* internal fields (like userId, recordedAt, $id) are added.

/** Data needed to create a new appointment. */
export type CreateAppointmentData = Pick<Appointment, 'date' | 'time'> & Partial<Pick<Appointment, 'notes' | 'appointmentType' | 'isCompleted'>>;
/** Data needed to create a new blood pressure reading. */
export type CreateBPData = Pick<BloodPressureReading, 'systolic' | 'diastolic'>;
/** Data needed to create a new blood sugar reading. */
export type CreateSugarData = Pick<BloodSugarReading, 'level' | 'measurementType'>;
/** Data needed to create a new weight reading. */
export type CreateWeightData = Pick<WeightReading, 'weight' | 'unit'>;
/** Data needed to create a new medication reminder. */
export type CreateMedicationReminderData = Pick<MedicationReminder, 'medicationName' | 'dosage' | 'frequency'> & Partial<Pick<MedicationReminder, 'times' | 'notes' | 'isActive'>>;
/** Data needed to create a new blog post. */
export type CreateBlogPostData = Pick<BlogPost, 'title' | 'slug' | 'content' | 'author'> &
    Partial<Pick<BlogPost, 'category' | 'tags' | 'publishedAt' | 'imageFileId' | 'imageUrl'>>;
/**
 * Data needed to update an existing blog post.
 * All fields are optional, only provided fields will be updated.
 * Slug update might require careful handling depending on unique index constraints.
 */
export type UpdateBlogPostData = Partial<Pick<BlogPost, 'slug' | 'title' | 'content' | 'category' | 'imageUrl' | 'imageFileId' | 'tags'>>;

// --- Utility Function for Error Handling ---
/**
 * Handles Appwrite exceptions and other errors, logging them consistently.
 * @param error The error object caught.
 * @param context A string describing the operation context (e.g., "creating account").
 * @param throwGeneric Set to true to throw a generic error after logging. Defaults to false.
 * @returns The original error (useful if throwGeneric is false and you want to handle specific errors upstream).
 */
const handleAppwriteError = (error: unknown, context: string, throwGeneric: boolean = false): unknown => {
    let errorMessage = `Error ${context}: Unknown error occurred.`;
    let errorCode: number | string | undefined = undefined;
    let errorType: string | undefined = undefined;

    if (error instanceof AppwriteException) {
        errorCode = error.code;
        errorType = error.type;
        errorMessage = `Error ${context}: ${error.message} (Code: ${errorCode}, Type: ${errorType})`;
        console.error(`AppwriteException during ${context}:`, {
            message: error.message,
            code: error.code,
            type: error.type,
            response: error.response // Contains more details from Appwrite
        });
    } else if (error instanceof Error) {
        errorMessage = `Error ${context}: ${error.message}`;
        console.error(`Error during ${context}:`, error);
    } else {
        console.error(`Unknown error type during ${context}:`, error);
    }

    if (throwGeneric) {
        // Throw a new, generic error to avoid leaking detailed Appwrite exceptions to the UI/user
        throw new Error(`Operation failed: ${context}. Please check logs or try again.`);
    }

    // Return the original error so it can be inspected or handled further upstream if needed
    return error;
};


// --- Authentication Functions ---

/**
 * Creates a new user account, logs them in, and attempts to create a basic profile.
 * @returns The newly created Appwrite User object.
 * @throws Will re-throw errors after logging via handleAppwriteError.
 */
export const createAccount = async (email: string, password: string, name: string): Promise<Models.User<Models.Preferences>> => {
    try {
        // Validate inputs
        if (!email || !password || !name) {
            throw new Error("Email, password, and name are required to create an account.");
        }
        const newUserAccount = await account.create(ID.unique(), email, password, name);
        console.log(`Account created for ${email}, User ID: ${newUserAccount.$id}`);

        // Log in the new user immediately after successful creation
        await login(email, password);
        console.log(`User ${newUserAccount.$id} automatically logged in.`);

        // Attempt to create a basic profile upon signup (best effort)
        try {
            // Ensure name and email are passed correctly if needed by createUserProfile logic
            await createUserProfile(newUserAccount.$id, { name: name, email: email });
            console.log(`Basic profile automatically created for new user ${newUserAccount.$id}`);
        } catch (profileError) {
            // Log profile creation failure but don't fail the overall signup process
            console.warn(`Failed to auto-create profile for user ${newUserAccount.$id} after signup. User needs to complete profile manually. Error:`, profileError);
            // Optionally notify the user in the UI that profile setup is needed
        }
        return newUserAccount;
    } catch (error) {
        handleAppwriteError(error, 'creating account');
        // Re-throw the original error (or the generic one if handleAppwriteError was configured to throw)
        throw error;
    }
};

/**
 * Creates an email/password session for the user (logs them in).
 * @returns The Appwrite Session object.
 * @throws Will re-throw errors after logging.
 */
export const login = async (email: string, password: string): Promise<Models.Session> => {
    try {
        if (!email || !password) {
            throw new Error("Email and password are required to log in.");
        }
        const session = await account.createEmailPasswordSession(email, password);
        console.log(`User ${email} logged in successfully. Session ID: ${session.$id}`);
        return session;
    } catch (error) {
        handleAppwriteError(error, 'logging in');
        throw error;
    }
};

/**
 * Deletes the current user session (logs them out).
 * @throws Will re-throw errors after logging.
 */
export const logout = async (): Promise<void> => {
    try {
        await account.deleteSession('current');
        console.log("User logged out successfully.");
    } catch (error) {
        handleAppwriteError(error, 'logging out');
        throw error;
    }
};

/**
 * Retrieves the currently logged-in user object.
 * Returns null if no user is logged in (handles 401 error gracefully).
 * @returns The Appwrite User object or null.
 */
export const getCurrentUser = async (): Promise<Models.User<Models.Preferences> | null> => {
    try {
        const currentUser = await account.get();
        // console.log("Current user fetched:", currentUser.$id); // Avoid logging PII like email here
        return currentUser;
    } catch (error) {
        // Appwrite throws a 401 error if not logged in, which is expected. Return null.
        if (error instanceof AppwriteException && (error.code === 401 || error.type === 'user_unauthorized' || error.type === 'general_unauthorized_scope')) {
             // console.log("No user currently logged in."); // Normal operation, no need to log as error
             return null;
        }
        // Log unexpected errors
        handleAppwriteError(error, 'fetching current user', false); // Log but don't throw generic error
        return null; // Return null for any other error during fetch
    }
};


// --- Blog Post Functions ---

/**
 * Fetches a list of blog posts, optionally filtered by search term (title) or category.
 * Requires blogCollectionId to be configured.
 * @param search Optional search term for the title.
 * @param category Optional category to filter by.
 * @returns An array of BlogPost objects. Returns empty array on error or if not configured.
 */
export const getBlogPosts = async (search = '', category = ''): Promise<BlogPost[]> => {
    if (!blogCollectionId) {
        console.warn("Blog Collection ID not configured. Skipping blog post fetch.");
        return [];
    }
    try {
        const queries: string[] = [
            Query.orderDesc('$createdAt'), // Show newest first
            Query.limit(25) // Default limit, consider making this configurable
        ];
        // Add search query if provided (ensure 'title' attribute is indexed for search)
        if (search.trim()) {
            queries.push(Query.search('title', search.trim()));
            console.log(`Applying search query for title: "${search.trim()}"`);
        }
        // Add category filter if provided and not 'All' (ensure 'category' attribute is indexed)
        if (category.trim() && category.toLowerCase() !== 'all') {
            queries.push(Query.equal('category', category.trim()));
            console.log(`Applying filter for category: "${category.trim()}"`);
        }

        console.log("Executing listDocuments with queries:", queries);
        const response = await databases.listDocuments<BlogPost>(databaseId, blogCollectionId, queries);
        console.log(`Fetched ${response.documents.length} blog posts.`);
        return response.documents;
    } catch (error) {
        handleAppwriteError(error, `fetching blog posts (search: '${search}', category: '${category}')`, false);
        return []; // Return empty array on error
    }
};

/**
 * Creates a new blog post document.
 * Requires blogCollectionId to be configured.
 * Enforces required fields and slug format. Handles unique slug conflicts.
 * @param postData Data for the new blog post, conforming to CreateBlogPostData.
 * @returns The newly created BlogPost object.
 * @throws Will re-throw errors after logging, including specific messages for validation/slug conflicts.
 */
export const createBlogPost = async (postData: CreateBlogPostData): Promise<BlogPost> => {
  if (!blogCollectionId) {
      throw new Error("Blog Collection ID is not configured. Cannot create blog post.");
  }

  // --- Input Validation ---
  if (!postData.title?.trim()) throw new Error("Blog post title cannot be empty.");
  if (!postData.slug?.trim()) throw new Error("Blog post slug cannot be empty.");
  if (!postData.content?.trim()) throw new Error("Blog post content cannot be empty.");
  if (!postData.author?.trim()) throw new Error("Blog post author cannot be empty."); // Or set a default server-side?

  // Basic slug format validation (lowercase letters, numbers, hyphens, no leading/trailing hyphen)
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slugRegex.test(postData.slug)) {
    throw new Error("Invalid slug format. Use only lowercase letters, numbers, and single hyphens (e.g., 'my-first-post'). Cannot start or end with a hyphen.");
  }

  try {
      // Prepare the data payload, excluding system fields and undefined values
      const dataToSend: Partial<Omit<BlogPost, keyof AppwriteDocument>> = {
          title: postData.title.trim(),
          slug: postData.slug.trim(),
          content: postData.content, // Don't trim content here, preserve user formatting
          author: postData.author.trim(),
          category: postData.category?.trim() || undefined, // Ensure category is trimmed or undefined
          imageUrl: postData.imageUrl?.trim() || undefined,
          imageFileId: postData.imageFileId?.trim() || undefined,
          tags: postData.tags?.map(tag => tag.trim()).filter(Boolean) || [], // Ensure tags are trimmed and non-empty
          publishedAt: postData.publishedAt || undefined, // Pass through if provided
      };

      // Filter out any keys with undefined values before sending
      const filteredDataToSend = Object.fromEntries(
          Object.entries(dataToSend).filter(([_, v]) => v !== undefined)
      );

      console.log("Submitting Blog Post Data:", filteredDataToSend);

      // Define permissions for the new document (e.g., publicly readable, admin manage)
      const permissions = [
         Permission.read(Role.any()), // Anyone can read
         // Assuming an 'admin' team exists for management
         Permission.update(Role.team('admin')),
         Permission.delete(Role.team('admin')),
         // If you want the author (logged-in user) to also manage their own post:
         // const currentUser = await getCurrentUser();
         // if (currentUser) {
         //    permissions.push(Permission.update(Role.user(currentUser.$id)));
         //    permissions.push(Permission.delete(Role.user(currentUser.$id)));
         // }
      ];

      // Use ID.unique() for Appwrite to generate the document ID
      return await databases.createDocument<BlogPost>(
          databaseId,
          blogCollectionId,
          ID.unique(), // Let Appwrite generate the document ID
          filteredDataToSend,
          permissions
      );
  } catch (error) {
      // Check specifically for unique constraint violation on the slug index
      if (error instanceof AppwriteException && error.code === 409) { // 409 Conflict
          // Check if the error message clearly indicates a conflict on the 'slug' index
          if (error.message.toLowerCase().includes('index') && error.message.toLowerCase().includes('slug')) {
             const slugConflictError = new Error(`This slug "${postData.slug}" is already taken. Please choose a different one.`);
             handleAppwriteError(slugConflictError, 'creating blog post (slug conflict)', false); // Log specific error
             throw slugConflictError; // Throw the specific, user-friendly error
          }
      }
      // Handle other errors generally
      handleAppwriteError(error, 'creating blog post');
      throw error; // Re-throw original or handled error
  }
};

/**
 * Fetches a single blog post by its document ID ($id).
 * Requires blogCollectionId to be configured.
 * @param id The $id of the blog post document.
 * @returns The BlogPost object or null if not found, not configured, or on error.
 */
export const getBlogPost = async (id: string): Promise<BlogPost | null> => {
    if (!blogCollectionId) {
        console.warn("Blog Collection ID not configured. Cannot get blog post by ID.");
        return null;
    }
    if (!id?.trim()) {
        console.warn("getBlogPost called with an empty or invalid ID.");
        return null;
    }
    try {
        console.log(`Fetching blog post by ID: ${id}`);
        return await databases.getDocument<BlogPost>(databaseId, blogCollectionId, id);
    } catch (error) {
        // Handle 404 (Not Found) gracefully
        if (error instanceof AppwriteException && error.code === 404) {
            console.log(`Blog post with ID ${id} not found.`);
            return null; // Return null specifically for 404
        }
        // Handle other errors
        handleAppwriteError(error, `fetching blog post with ID ${id}`, false);
        return null; // Return null for any other error
    }
};

/**
 * Fetches a single blog post by its unique slug.
 * Requires blogCollectionId to be configured and the 'slug' attribute to have a UNIQUE index.
 * @param slug The slug of the blog post document.
 * @returns The BlogPost object or null if not found, not configured, index missing, or on error.
 */
export const getBlogPostBySlug = async (slug: string): Promise<BlogPost | null> => {
    if (!blogCollectionId) {
        console.error("Blog Collection ID is not configured. Cannot get blog post by slug.");
        return null;
    }
    if (!slug?.trim()) {
        console.warn("getBlogPostBySlug called with an empty or invalid slug.");
        return null;
    }
    console.log(`Fetching blog post by slug: "${slug}"`);
    try {
        const response = await databases.listDocuments<BlogPost>(
            databaseId,
            blogCollectionId,
            [
                Query.equal('slug', slug.trim()), // Query by the indexed slug
                Query.limit(1)                 // Expecting only one result due to unique index
            ]
        );

        if (response.documents.length > 0) {
            console.log(`Found post with slug "${slug}":`, response.documents[0].$id);
            const post = response.documents[0];
            // Example: Generate image URL if using Appwrite storage for images
            // if (post.imageFileId && blogImageBucketId) {
            //    const previewUrl = getFilePreview(post.imageFileId, blogImageBucketId);
            //    post.imageUrl = previewUrl ? previewUrl.href : undefined;
            // }
            return post;
        } else {
            console.log(`Blog post with slug "${slug}" not found in the database.`);
            return null; // Explicitly return null when not found
        }
    } catch (error) {
        // Handle specific errors like index not found
        if (error instanceof AppwriteException) {
            // A 400 error with 'index not found' often indicates the slug attribute isn't indexed
            if (error.code === 400 && error.message.toLowerCase().includes('index not found')) {
                 console.error(`Error fetching blog post by slug: The 'slug' attribute is likely not indexed (or not correctly indexed) in collection '${blogCollectionId}'. Please add a unique index for 'slug' in your Appwrite console.`);
                 return null;
            }
            // A 404 might occur in some listDocuments scenarios, though less common than for getDocument
            if (error.code === 404) {
                 console.log(`Blog post query for slug "${slug}" resulted in 404.`);
                 return null;
            }
        }
        // Use your existing error handler for other cases
        handleAppwriteError(error, `fetching blog post with slug "${slug}"`, false);
        return null; // Return null on general error
    }
};

/**
 * Updates an existing blog post document by its document ID ($id).
 * Requires blogCollectionId to be configured.
 * Handles slug format validation if slug is provided.
 * @param documentId The $id of the blog post document to update.
 * @param postData Data fields to update, conforming to UpdateBlogPostData.
 * @returns The updated BlogPost object.
 * @throws Will re-throw errors after logging.
 */
export const updateBlogPost = async (documentId: string, postData: UpdateBlogPostData): Promise<BlogPost> => {
    if (!blogCollectionId) {
        throw new Error("Blog Collection ID is not configured. Cannot update blog post.");
    }
    if (!documentId) {
        throw new Error("Document ID is required to update a blog post.");
    }

    // --- Input Validation & Preparation ---
    // Explicitly type dataToUpdate to help TypeScript understand its shape
    const dataToUpdate: UpdateBlogPostData = { ...postData };

    // Validate slug format if it's being updated
    if (dataToUpdate.slug !== undefined) {
        dataToUpdate.slug = dataToUpdate.slug?.trim(); // Trim first
        if (!dataToUpdate.slug) { // Check after trimming
            throw new Error("Blog post slug cannot be empty if provided for update.");
        }
        const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
        if (!slugRegex.test(dataToUpdate.slug)) {
            throw new Error("Invalid slug format. Use only lowercase letters, numbers, and single hyphens. Cannot start or end with a hyphen.");
        }
    }

     // Trim other string fields if provided, except content
     if (dataToUpdate.title !== undefined) dataToUpdate.title = dataToUpdate.title.trim();
     // Do not trim content, preserve user's formatting (newlines, spaces)
     if (dataToUpdate.content !== undefined) dataToUpdate.content = dataToUpdate.content;
     if (dataToUpdate.category !== undefined) dataToUpdate.category = dataToUpdate.category.trim() || undefined; // Allow empty string to clear? Or set undefined?
     if (dataToUpdate.imageUrl !== undefined) dataToUpdate.imageUrl = dataToUpdate.imageUrl.trim() || undefined;
     if (dataToUpdate.imageFileId !== undefined) dataToUpdate.imageFileId = dataToUpdate.imageFileId.trim() || undefined;

     // Ensure tags array is handled correctly if provided
     if (dataToUpdate.tags !== undefined) {
         if (dataToUpdate.tags === null) {
             dataToUpdate.tags = []; // Allow clearing tags with null
         } else if (Array.isArray(dataToUpdate.tags)) {
             // Ensure all elements are strings, trim them, and filter out empty ones
             dataToUpdate.tags = dataToUpdate.tags.map(tag => String(tag ?? '').trim()).filter(Boolean);
         } else {
             // If it's provided but not an array or null, log a warning and remove it
             console.warn("updateBlogPost: 'tags' provided but not as an array or null. Skipping update for this field.");
             delete dataToUpdate.tags; // Don't send invalid data
         }
     }

    // Filter out undefined values before sending to Appwrite
    // Appwrite updateDocument ignores undefined fields, but this explicit filtering can be clearer
    const filteredUpdateData = Object.fromEntries(
        Object.entries(dataToUpdate).filter(([_, v]) => v !== undefined)
    );

    // Prevent update if no actual data is being changed after filtering
    if (Object.keys(filteredUpdateData).length === 0) {
        console.warn("updateBlogPost called with no data to update for document:", documentId);
        // Fetch and return the current state instead of making an empty update call
        const currentPost = await getBlogPost(documentId);
        if (!currentPost) throw new Error(`Blog post with ID ${documentId} not found when trying to return current state.`);
        return currentPost;
    }

    try {
        console.log(`Updating blog post document ${documentId} with data:`, filteredUpdateData);
        // Note: updateDocument doesn't take permissions; existing permissions remain.
        // Ensure the user making the request has update permissions on the document.
        return await databases.updateDocument<BlogPost>(
            databaseId,
            blogCollectionId,
            documentId,
            filteredUpdateData // Send only the defined fields to be updated
        );
    } catch (error) {
        // Check specifically for unique constraint violation on the slug index if slug was updated
        if (filteredUpdateData.slug && error instanceof AppwriteException && error.code === 409) {
            if (error.message.toLowerCase().includes('index') && error.message.toLowerCase().includes('slug')) {
                const slugConflictError = new Error(`This slug "${filteredUpdateData.slug}" is already taken. Please choose a different one.`);
                handleAppwriteError(slugConflictError, `updating blog post ${documentId} (slug conflict)`, false);
                throw slugConflictError;
            }
        }
        // Handle other errors generally
        handleAppwriteError(error, `updating blog post ${documentId}`);
        throw error; // Re-throw original or handled error
    }
};

/**
 * Deletes a blog post document by its document ID ($id).
 * Optionally deletes associated image file from storage if imageFileId exists.
 * Requires blogCollectionId to be configured.
 * @param documentId The $id of the blog post document to delete.
 * @param imageFileId Optional: The ID of an associated image file in storage to delete.
 * @param imageBucketId Optional: The ID of the bucket containing the image file. Required if imageFileId is provided.
 * @throws Will re-throw errors after logging.
 */
export const deleteBlogPost = async (documentId: string, imageFileId?: string, imageBucketId?: string): Promise<void> => {
    if (!blogCollectionId) {
        throw new Error("Blog Collection ID is not configured. Cannot delete blog post.");
    }
    if (!documentId) {
        throw new Error("Document ID is required to delete a blog post.");
    }
    if (imageFileId && !imageBucketId) {
        console.warn(`deleteBlogPost: imageFileId (${imageFileId}) provided without imageBucketId. Cannot delete file from storage.`);
        // Proceed to delete only the document, but log the warning.
    }

    console.log(`Attempting to delete blog post document ${documentId}`);
    try {
        // 1. Optionally delete the associated image file from storage first
        if (imageFileId && imageBucketId) {
            try {
                console.log(`Deleting associated image file ${imageFileId} from bucket ${imageBucketId}...`);
                // Ensure the user making the request has delete permissions on the file.
                await storage.deleteFile(imageBucketId, imageFileId);
                console.log(`Associated image file ${imageFileId} deleted successfully.`);
            } catch (fileError) {
                // Log the file deletion error but proceed to delete the document record
                handleAppwriteError(fileError, `deleting associated image file ${imageFileId} for blog post ${documentId}`, false);
                console.warn(`Proceeding to delete blog document ${documentId} despite file deletion error.`);
            }
        }

        // 2. Delete the document record from the database
        // Ensure the user making the request has delete permissions on the document.
        await databases.deleteDocument(databaseId, blogCollectionId, documentId);
        console.log(`Blog post document ${documentId} deleted successfully.`);

    } catch (error) {
        handleAppwriteError(error, `deleting blog post document ${documentId}`);
        throw error;
    }
};


// --- User Profile Functions ---

/**
 * Creates a new user profile document OR updates if one already exists for the userId.
 * Ensures only the user can manage their profile.
 * @param userId The Appwrite user $id (required).
 * @param profileData An object containing profile fields to create/update.
 * @returns The created or updated UserProfile object.
 * @throws Will re-throw errors after logging.
 */
export const createUserProfile = async (userId: string, profileData: Partial<Omit<UserProfile, keyof AppwriteDocument | 'userId' | 'profilePhotoUrl'>>): Promise<UserProfile> => {
    if (!profilesCollectionId) throw new Error("Profile Collection ID is not configured.");
    if (!userId) throw new Error("User ID is required to create or update a profile.");

    try {
        // Check if a profile already exists for this user ID (assuming 'userId' is indexed)
        console.log(`Checking for existing profile for user ${userId}...`);
        const existingProfile = await getUserProfile(userId); // Use the existing fetch function

        if (existingProfile) {
            console.warn(`Profile already exists for user ${userId} (Document ID: ${existingProfile.$id}). Updating instead.`);
            // If profile exists, call updateUserProfile with the existing document ID and new data
            const dataToUpdate = { ...profileData };
            delete (dataToUpdate as any).userId; // Prevent accidental userId update via this route

            return updateUserProfile(existingProfile.$id, dataToUpdate);
        } else {
            // Profile does not exist, proceed with creation
            console.log(`No existing profile found for user ${userId}. Creating new profile.`);
            // Prepare data for creation, ensuring userId is included
            const dataToSend: Record<string, any> = { userId: userId, ...profileData };

            // Ensure array fields are initialized correctly if provided empty/null
            if (dataToSend.hasOwnProperty('dietaryPreferences') && !Array.isArray(dataToSend.dietaryPreferences)) {
                 console.warn("createUserProfile: dietaryPreferences provided but not as an array. Initializing as empty array.");
                 dataToSend.dietaryPreferences = [];
            } else if (!dataToSend.hasOwnProperty('dietaryPreferences')) {
                 dataToSend.dietaryPreferences = []; // Default to empty array if not provided
            }

            // Set document-level permissions: Only the user can manage their profile
            const userRole = Role.user(userId);
            const permissions = [
                Permission.read(userRole),
                Permission.update(userRole),
                Permission.delete(userRole)
                // Add other permissions if needed (e.g., admin read access)
                // Permission.read(Role.team('admin')),
            ];

            console.log("Creating profile with data:", dataToSend, "and permissions:", permissions);
            return await databases.createDocument<UserProfile>(
                databaseId,
                profilesCollectionId,
                ID.unique(), // Let Appwrite generate document ID
                dataToSend,
                permissions
            );
        }
    } catch (error) {
        handleAppwriteError(error, `creating/updating profile for user ${userId}`);
        throw error;
    }
};

/**
 * Fetches the user profile document associated with a given userId.
 * Generates the profile photo URL if available. Handles 'userId' index requirement.
 * @param userId The Appwrite user $id.
 * @returns The UserProfile object or null if not found, not configured, or on error.
 */
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
    if (!profilesCollectionId) {
        console.error("getUserProfile Error: Profile Collection ID is not configured!");
        return null;
    }
    if (!userId) {
        console.warn("getUserProfile called with no userId.");
        return null;
    }

    try {
        console.log(`Fetching profile for user ID: ${userId}`);
        // Query by the indexed 'userId' attribute
        const response = await databases.listDocuments<UserProfile>(
            databaseId,
            profilesCollectionId,
            [
                Query.equal('userId', userId),
                Query.limit(1) // Expecting only one profile per user ID
            ]
        );

        if (response.documents.length > 0) {
            const profile = response.documents[0];
            console.log(`Profile found for user ${userId} (Document ID: ${profile.$id})`);

            // Generate profile photo URL if ID exists and bucket ID is valid
            if (profile.profilePhotoId && profileBucketId) {
                 try {
                    // Use getFilePreview which returns a URL object
                    const previewUrlObject: URL | null = getFilePreview(profile.profilePhotoId, profileBucketId);
                    profile.profilePhotoUrl = previewUrlObject ? previewUrlObject.href : undefined; // Assign the URL string
                 } catch (previewError) {
                    // Log error but don't fail the profile fetch
                    handleAppwriteError(previewError, `generating profile photo preview URL for user ${userId}`, false);
                    profile.profilePhotoUrl = undefined; // Ensure it's undefined if preview fails
                 }
            } else {
                 profile.profilePhotoUrl = undefined; // Ensure it's undefined if no photoId or bucketId
            }

            // Ensure array fields are arrays, even if Appwrite returns null/undefined
             if (!Array.isArray(profile.dietaryPreferences)) {
                 profile.dietaryPreferences = [];
             }
             // Add similar checks for other potential array fields

            return profile;
        } else {
            console.log(`No profile found for user ID: ${userId}`);
            return null; // No profile found for this userId
        }
    } catch (error) {
         // Handle specific errors like index not found on 'userId'
        if (error instanceof AppwriteException && error.code === 400 && error.message.toLowerCase().includes('index not found')) {
            console.error(`Error fetching profile: The 'userId' attribute is likely not indexed in collection '${profilesCollectionId}'. Please add an index in your Appwrite console.`);
        }
        handleAppwriteError(error, `fetching profile for user ${userId}`, false);
        return null; // Return null on error
    }
};

/**
 * Updates an existing user profile document by its document $id.
 * Filters out undefined fields and handles array updates carefully.
 * @param profileDocumentId The $id of the profile document to update.
 * @param profileData An object containing the profile fields to update.
 * @returns The updated UserProfile object.
 * @throws Will re-throw errors after logging.
 */
export const updateUserProfile = async (profileDocumentId: string, profileData: Partial<Omit<UserProfile, keyof AppwriteDocument | 'userId' | 'profilePhotoUrl'>>): Promise<UserProfile> => {
     if (!profilesCollectionId) throw new Error("Profile Collection ID is not configured.");
     if (!profileDocumentId) throw new Error("Profile document ID is required for update.");

    try {
        // Create a mutable copy and remove fields that shouldn't be updated directly or via this function
        const dataToUpdate = { ...profileData };
        delete (dataToUpdate as any).userId; // Prevent accidental userId update
        delete (dataToUpdate as any).email; // Typically email shouldn't be updated here (managed via Account service)
        delete (dataToUpdate as any).profilePhotoUrl; // This is generated, not stored

        // Filter out undefined values to prevent unintentionally clearing fields in Appwrite
        const filteredUpdateData = Object.fromEntries(
            Object.entries(dataToUpdate).filter(([_, v]) => v !== undefined)
        );

        // Special handling for array fields: if null is passed, send empty array to clear
        if (filteredUpdateData.hasOwnProperty('dietaryPreferences')) {
            if (filteredUpdateData.dietaryPreferences === null) {
                 filteredUpdateData.dietaryPreferences = []; // Send empty array to clear in Appwrite
            } else if (!Array.isArray(filteredUpdateData.dietaryPreferences)) {
                 // If it's provided but not an array, log a warning and remove it to avoid Appwrite error
                 console.warn("updateUserProfile: dietaryPreferences provided but not as an array. Skipping update for this field.");
                 delete filteredUpdateData.dietaryPreferences;
            }
        }
        // Add similar handling for other array fields if necessary

        // Avoid making an update call if no actual data is being changed
        if (Object.keys(filteredUpdateData).length === 0) {
            console.warn("updateUserProfile called with no data to update for document:", profileDocumentId);
            // Fetch and return the current profile state without making an update call
             return await databases.getDocument<UserProfile>(databaseId, profilesCollectionId, profileDocumentId);
        }

        console.log(`Updating profile document ${profileDocumentId} with data:`, filteredUpdateData);
        // Perform the update
        // Ensure the user making the request has update permissions on the document.
        return await databases.updateDocument<UserProfile>(
            databaseId,
            profilesCollectionId,
            profileDocumentId,
            filteredUpdateData // Send only the defined fields to be updated
        );
    } catch (error) {
        handleAppwriteError(error, `updating profile document ${profileDocumentId}`);
        throw error;
    }
};

/**
 * Uploads a profile photo file to the designated profile photo bucket.
 * Sets permissions so only the owner can read the file.
 * @param file The File object to upload.
 * @param userId The ID of the user owning the photo (for setting permissions).
 * @returns The Appwrite File object representing the uploaded file.
 * @throws Will re-throw errors after logging.
 */
export const uploadProfilePhoto = async (file: File, userId: string): Promise<Models.File> => {
    if (!profileBucketId) throw new Error("Profile Photo Bucket ID is not configured.");
    if (!file) throw new Error("No file provided for profile photo upload.");
    if (!userId) throw new Error("User ID is required to set permissions for profile photo.");

    try {
        // Define permissions: Grant read access ONLY to the user who owns it
        const userRole = Role.user(userId);
        const permissions = [
            Permission.read(userRole),
            // Optional: Allow user to update/delete their own photo file directly if needed
            // Permission.update(userRole),
            // Permission.delete(userRole),
            // Optional: Allow admins to read?
            // Permission.read(Role.team('admin')),
        ];

        console.log(`Uploading profile photo for user ${userId} to bucket ${profileBucketId} with permissions:`, permissions);

        // Generate a unique ID for the file to prevent name collisions
        const fileId = ID.unique();
        const uploadedFile = await storage.createFile(
            profileBucketId,
            fileId,
            file,
            permissions // Pass permissions array here
        );
        console.log(`Profile photo uploaded successfully. File ID: ${uploadedFile.$id}`);
        return uploadedFile;
    } catch (error) {
        handleAppwriteError(error, `uploading profile photo for user ${userId}`);
        throw error;
    }
};


// --- Medical Document Functions ---

/**
 * Uploads a medical document file to storage and creates a corresponding database record.
 * Implements cleanup logic if DB record creation fails after file upload.
 * Sets permissions so only the owner can manage the file and record.
 * @param file The File object to upload.
 * @param userId The ID of the user uploading the document.
 * @param description Optional description for the document.
 * @returns The Appwrite File object representing the uploaded file.
 * @throws Will re-throw errors after logging.
 */
export const uploadMedicalDocument = async (file: File, userId: string, description?: string): Promise<Models.File> => {
    // Validate required parameters and configuration
    if (!userId) throw new Error("User ID is required for uploading medical document.");
    if (!medicalBucketId) throw new Error("Medical Bucket ID not configured.");
    if (!medicalDocumentsCollectionId) throw new Error("Medical Docs Collection ID not configured.");
    if (!file) throw new Error("No file provided for medical document upload.");

    let uploadedFile: Models.File | null = null;
    const fileId = ID.unique(); // Generate file ID once

    try {
        // Define file-level permissions (only owner can read/delete)
        const userRole = Role.user(userId);
        const filePermissions = [
             Permission.read(userRole),
             // Permission.update(userRole), // Usually not needed for immutable uploads
             Permission.delete(userRole)
        ];

        // 1. Upload the file to storage
        console.log(`Uploading medical document "${file.name}" for user ${userId} to bucket ${medicalBucketId} with ID ${fileId}`);
        uploadedFile = await storage.createFile(
            medicalBucketId,
            fileId,
            file,
            filePermissions
        );
        console.log(`File ${fileId} uploaded successfully.`);

        // 2. Create the corresponding document in the database
        const docData: Omit<MedicalDocument, keyof AppwriteDocument> = {
             userId,
             fileId: uploadedFile.$id, // Use the ID from the successfully uploaded file
             fileName: file.name,
             documentType: file.type || 'application/octet-stream', // Fallback MIME type
             description: description?.trim() || undefined // Trim description or set undefined
        };
        // Define document-level permissions (should match file permissions for consistency)
        const docPermissions = [
             Permission.read(userRole),
             Permission.update(userRole), // Allow user to update description/metadata
             Permission.delete(userRole)
        ];

        console.log(`Creating medical document record in collection ${medicalDocumentsCollectionId} with data:`, docData);
        await databases.createDocument<MedicalDocument>(
            databaseId,
            medicalDocumentsCollectionId,
            ID.unique(), // Let Appwrite generate document ID for the record
            docData,
            docPermissions
        );
        console.log(`Medical document record created successfully for file ${fileId}.`);

        return uploadedFile; // Return the file object on complete success

    } catch (error) {
        // --- Cleanup Logic ---
        // If file was uploaded but DB record creation failed, attempt to delete the orphaned file
        if (uploadedFile?.$id) { // Check if upload succeeded before the error occurred
            console.warn(`Database record creation failed after file upload (File ID: ${uploadedFile.$id}). Attempting to delete orphaned file from bucket ${medicalBucketId}.`);
            try {
                await storage.deleteFile(medicalBucketId, uploadedFile.$id);
                console.log(`Orphaned file ${uploadedFile.$id} deleted successfully.`);
            } catch (deleteError) {
                // Log cleanup failure critically, but prioritize throwing the original error
                console.error(`CRITICAL: Failed to delete orphaned file ${uploadedFile.$id} after DB error. Manual cleanup required in bucket ${medicalBucketId}. Delete Error:`, deleteError);
                handleAppwriteError(deleteError, `deleting orphaned file ${uploadedFile.$id}`, false); // Log cleanup error separately
            }
        }
        // Handle and re-throw the original error that caused the failure
        handleAppwriteError(error, `uploading medical document for user ${userId}`);
        throw error;
    }
};

/**
 * Fetches all medical document records for a specific user.
 * @param userId The Appwrite user $id.
 * @returns An array of MedicalDocument objects. Returns empty array on error.
 */
export const getUserMedicalDocuments = async (userId: string): Promise<MedicalDocument[]> => {
    if (!userId) { console.warn("getUserMedicalDocuments called with no userId."); return []; }
    if (!medicalDocumentsCollectionId) {
        console.warn("Medical Docs Collection ID not configured. Cannot fetch documents.");
        return [];
    }
    try {
        console.log(`Fetching medical documents for user ${userId}`);
        const response = await databases.listDocuments<MedicalDocument>(
            databaseId, medicalDocumentsCollectionId,
            [
                Query.equal('userId', userId), // Ensure 'userId' is indexed
                Query.orderDesc('$createdAt'), // Show newest first
                Query.limit(100) // Add a sensible limit, adjust as needed
            ]
        );
        console.log(`Found ${response.documents.length} medical documents for user ${userId}.`);
        return response.documents;
    } catch (error) {
        handleAppwriteError(error, `fetching medical documents for user ${userId}`, false);
        return []; // Return empty array on error
    }
};

/**
 * Deletes a medical document record from the database AND the corresponding file from storage.
 * Prioritizes deleting the file first to avoid orphans.
 * @param document The MedicalDocument object containing $id and fileId.
 * @throws Will re-throw errors after logging.
 */
export const deleteMedicalDocument = async (document: MedicalDocument): Promise<void> => {
     // Validate input
     if (!document?.$id) throw new Error("Invalid medical document record ID provided for deletion.");
     if (!document?.fileId) throw new Error("Invalid file ID in medical document record for deletion.");
     if (!medicalBucketId) throw new Error("Medical Bucket ID not configured.");
     if (!medicalDocumentsCollectionId) throw new Error("Medical Docs Collection ID not configured.");

    console.log(`Attempting to delete medical document record ${document.$id} and file ${document.fileId}`);
    try {
        // 1. Delete the file from storage first (more critical to avoid orphans)
        console.log(`Deleting file ${document.fileId} from bucket ${medicalBucketId}...`);
        // Ensure the user making the request has delete permissions on the file.
        await storage.deleteFile(medicalBucketId, document.fileId);
        console.log(`File ${document.fileId} deleted successfully.`);

        // 2. Delete the document record from the database
        console.log(`Deleting document record ${document.$id} from collection ${medicalDocumentsCollectionId}...`);
        // Ensure the user making the request has delete permissions on the document.
        await databases.deleteDocument(databaseId, medicalDocumentsCollectionId, document.$id);
        console.log(`Document record ${document.$id} deleted successfully.`);

    } catch (error) {
        // Note: If DB delete fails after file delete, manual DB cleanup might be needed.
        // Conversely, if file delete fails, the DB record might remain pointing to a non-existent file.
        handleAppwriteError(error, `deleting medical document (DocID: ${document.$id}, FileID: ${document.fileId})`);
        throw error;
    }
};


// --- File Utility Functions ---

/**
 * Gets a preview URL (using getFileView) for a file in a specified bucket.
 * Returns a URL object which can be converted to string via `.href`.
 * @param fileId The $id of the file in Appwrite Storage.
 * @param bucketIdToUse The ID of the bucket containing the file.
 * @returns A URL object for the file view, or null if IDs are invalid, config missing, or an error occurs.
 */
export const getFilePreview = (fileId: string, bucketIdToUse: string): URL | null => {
    // Validate inputs and configuration
    if (!fileId?.trim()) {
        console.error("getFilePreview requires a valid fileId.");
        return null;
    }
     if (!bucketIdToUse?.trim()) {
        console.error(`getFilePreview requires a valid bucketId. Provided: ${bucketIdToUse}`);
        return null;
    }
     // Redundant check if using config validation, but safe
     if (bucketIdToUse.startsWith('YOUR_') || bucketIdToUse.length < 5) {
         console.error(`getFilePreview called with potentially invalid bucketId: ${bucketIdToUse}`);
         return null;
     }

    try {
        // Use getFileView: Returns a direct link to the file content.
        // Ensure the user making the request has read permissions on the file.
        const fileUrlString = storage.getFileView(bucketIdToUse, fileId).toString();
        return new URL(fileUrlString); // Construct and return URL object
    } catch (error) {
         // Catch potential errors from URL constructor or Appwrite SDK call
         handleAppwriteError(error, `getting file view URL for file ${fileId} in bucket ${bucketIdToUse}`, false);
         return null;
    }
};


// --- Appointment Functions ---

/**
 * Creates a new appointment document for a user.
 * Sets appropriate permissions.
 * @param userId The Appwrite user $id.
 * @param appointmentData Data for the new appointment (date and time required).
 * @returns The newly created Appointment object.
 * @throws Will re-throw errors after logging.
 */
export const createAppointment = async (userId: string, appointmentData: CreateAppointmentData): Promise<Appointment> => {
     if (!userId) throw new Error("User ID is required to create an appointment.");
     if (!appointmentsCollectionId) throw new Error("Appointments Collection ID is not configured.");

     // Basic validation of input data
     if (!appointmentData || !appointmentData.date?.trim() || !appointmentData.time?.trim()) {
         throw new Error("Appointment date and time are required.");
     }

    try {
        // Prepare data, setting defaults and ensuring userId is included
        const dataToCreate: Omit<Appointment, keyof AppwriteDocument> = {
            userId: userId,
            date: appointmentData.date.trim(), // Store date (ideally as full ISO datetime string)
            time: appointmentData.time.trim(), // Store time string
            isCompleted: appointmentData.isCompleted ?? false, // Default status to false if not provided
            appointmentType: appointmentData.appointmentType?.trim() || 'General', // Default type if empty/not provided
            notes: appointmentData.notes?.trim() || undefined, // Trim notes or set undefined
        };

        // Define document-level permissions (only owner can manage)
        const userRole = Role.user(userId);
        const permissions = [
            Permission.read(userRole),
            Permission.update(userRole),
            Permission.delete(userRole)
        ];

        console.log(`Creating appointment for user ${userId} with data:`, dataToCreate);
        return await databases.createDocument<Appointment>(
            databaseId,
            appointmentsCollectionId,
            ID.unique(),
            dataToCreate,
            permissions
        );
    } catch (error) {
        handleAppwriteError(error, `creating appointment for user ${userId}`);
        throw error;
    }
};

/**
 * Fetches all appointments for a specific user, sorted by date.
 * Requires 'userId' and 'date' attributes to be indexed.
 * @param userId The Appwrite user $id.
 * @returns An array of Appointment objects. Returns empty array on error.
 */
export const getUserAppointments = async (userId: string): Promise<Appointment[]> => {
  if (!userId) { console.warn("getUserAppointments called with no userId."); return []; }
  if (!appointmentsCollectionId) {
      console.warn("Appointments Collection ID not configured. Cannot fetch appointments.");
      return [];
  }
 try {
     console.log(`Fetching appointments for user ${userId}`);
     // Ensure 'userId' and 'date' attributes are indexed in Appwrite
     const response = await databases.listDocuments<Appointment>(
         databaseId, appointmentsCollectionId,
         [
             Query.equal('userId', userId),
             Query.orderAsc('date'), // Primary sort: by date
             Query.limit(100) // Sensible limit, adjust as needed
         ]
     );
     console.log(`Found ${response.documents.length} appointments for user ${userId}.`);
     return response.documents;
 } catch (error) {
     handleAppwriteError(error, `fetching appointments for user ${userId}`, false);
     return []; // Return empty array on error
 }
};

/**
 * Updates an existing appointment document by its $id.
 * @param appointmentDocumentId The $id of the appointment document.
 * @param appointmentData An object containing fields to update.
 * @returns The updated Appointment object.
 * @throws Will re-throw errors after logging.
 */
export const updateAppointment = async (appointmentDocumentId: string, appointmentData: Partial<Omit<Appointment, keyof AppwriteDocument | 'userId'>>): Promise<Appointment> => {
     if (!appointmentsCollectionId) throw new Error("Appointments Collection ID is not configured.");
     if (!appointmentDocumentId) throw new Error("Appointment document ID is required for update.");

    try {
        const dataToUpdate = { ...appointmentData };
        delete (dataToUpdate as any).userId; // Ensure userId isn't sent in update payload

        // Filter out undefined values
        const filteredUpdateData = Object.fromEntries(
            Object.entries(dataToUpdate).filter(([_, v]) => v !== undefined)
        );

        // Avoid update call if no data provided
        if (Object.keys(filteredUpdateData).length === 0) {
             console.warn(`updateAppointment called with no data for document ${appointmentDocumentId}.`);
             // Return current document state
             return await databases.getDocument<Appointment>(databaseId, appointmentsCollectionId, appointmentDocumentId);
        }

        console.log(`Updating appointment ${appointmentDocumentId} with data:`, filteredUpdateData);
        // Ensure the user making the request has update permissions on the document.
        return await databases.updateDocument<Appointment>(
            databaseId,
            appointmentsCollectionId,
            appointmentDocumentId,
            filteredUpdateData
        );
    } catch (error) {
        handleAppwriteError(error, `updating appointment ${appointmentDocumentId}`);
        throw error;
    }
};

/**
 * Deletes an appointment document by its $id.
 * @param appointmentDocumentId The $id of the appointment document to delete.
 * @throws Will re-throw errors after logging.
 */
export const deleteAppointment = async (appointmentDocumentId: string): Promise<void> => {
     if (!appointmentsCollectionId) throw new Error("Appointments Collection ID is not configured.");
     if (!appointmentDocumentId) throw new Error("Appointment document ID is required for deletion.");
    try {
        console.log(`Deleting appointment ${appointmentDocumentId}`);
        // Ensure the user making the request has delete permissions on the document.
        await databases.deleteDocument(databaseId, appointmentsCollectionId, appointmentDocumentId);
        console.log(`Successfully deleted appointment ${appointmentDocumentId}`);
    } catch (error) {
        handleAppwriteError(error, `deleting appointment ${appointmentDocumentId}`);
        throw error;
    }
};


// --- Health Reading Functions (Refactored Generic Helpers) ---

/**
 * Generic function to create any health reading document.
 * Handles validation, adds userId and recordedAt timestamp, sets permissions.
 * @template T The specific health reading type (e.g., BloodPressureReading).
 * @template D The input data type for the specific reading (e.g., CreateBPData).
 * @param userId Appwrite user $id.
 * @param collectionId Target collection ID.
 * @param collectionName User-friendly name for logging/errors.
 * @param data Input data for the reading.
 * @param requiredFields Array of keys required in the input data.
 * @returns The newly created health reading document of type T.
 * @throws Will re-throw errors after logging.
 */
const createHealthReading = async <T extends HealthReadingBase, D extends object>(
    userId: string,
    collectionId: string,
    collectionName: string,
    data: D,
    requiredFields: (keyof D)[]
): Promise<T> => {
    // --- Validation ---
    if (!userId) throw new Error(`User ID is required to create ${collectionName} reading.`);
    if (!collectionId) throw new Error(`${collectionName} Collection ID is not configured.`);
    if (!data) throw new Error(`Input data is required for ${collectionName}.`);

    // Validate required fields in the input data
    for (const field of requiredFields) {
        // Use type assertion to access properties on D safely
        const value = (data as any)[field];
        if (value === null || value === undefined || String(value).trim() === '') {
             throw new Error(`Field '${String(field)}' is required and cannot be empty for ${collectionName}.`);
        }
        if (typeof value === 'number' && isNaN(value)) {
             throw new Error(`Field '${String(field)}' must be a valid number for ${collectionName}.`);
        }
        if (typeof value === 'number' && value < 0) {
            // Allow 0 for blood sugar level, potentially others? Adjust as needed.
            if (!(collectionName === 'Blood Sugar' && field === 'level' && value === 0)) {
                 throw new Error(`Field '${String(field)}' must be a non-negative number for ${collectionName}.`);
            }
        }
    }

    try {
        // Prepare payload: spread input data, add userId and timestamp
        const payload = {
            userId,
            ...data,
            recordedAt: new Date().toISOString(), // Add current timestamp in ISO format
        } as Omit<T, keyof AppwriteDocument>; // Assert structure matches required type

        // Define document-level permissions (owner manage)
        const userRole = Role.user(userId);
        const permissions = [
            Permission.read(userRole),
            // Permission.update(userRole), // Often readings are immutable
            Permission.delete(userRole)
        ];

        console.log(`Creating ${collectionName} reading for user ${userId} with payload:`, payload);
        return await databases.createDocument<T>(
            databaseId,
            collectionId,
            ID.unique(),
            payload,
            permissions
        );
    } catch (error) {
        handleAppwriteError(error, `creating ${collectionName} reading for user ${userId}`);
        throw error;
    }
};

/**
 * Generic function to fetch health readings for a user, sorted by recorded date.
 * Requires 'userId' and 'recordedAt' attributes to be indexed.
 * @template T The specific health reading type.
 * @param userId Appwrite user $id.
 * @param collectionId Target collection ID.
 * @param collectionName User-friendly name for logging.
 * @param limit Max number of readings to fetch (default 50).
 * @returns An array of health reading documents of type T. Returns empty array on error.
 */
const getHealthReadings = async <T extends HealthReadingBase>(
    userId: string,
    collectionId: string,
    collectionName: string,
    limit: number = 50
): Promise<T[]> => {
    if (!userId) { console.warn(`getHealthReadings (${collectionName}) called with no userId.`); return []; }
    if (!collectionId) {
        console.warn(`${collectionName} Collection ID not configured. Cannot fetch readings.`);
        return [];
    }
    try {
        console.log(`Fetching ${collectionName} readings for user ${userId} (limit: ${limit})`);
        // Ensure 'userId' and 'recordedAt' attributes are indexed in Appwrite
        const response = await databases.listDocuments<T>(
            databaseId, collectionId,
            [
                Query.equal('userId', userId),
                Query.orderDesc('recordedAt'), // Fetch newest first
                Query.limit(limit)
            ]
        );
        console.log(`Found ${response.documents.length} ${collectionName} readings for user ${userId}.`);
        return response.documents;
    } catch (error) {
        handleAppwriteError(error, `fetching ${collectionName} readings for user ${userId}`, false);
        return [];
    }
};

/**
 * Generic function to delete a health reading document by its $id.
 * @param documentId The $id of the document to delete.
 * @param collectionId Target collection ID.
 * @param collectionName User-friendly name for logging.
 * @throws Will re-throw errors after logging.
 */
const deleteHealthReading = async (
    documentId: string,
    collectionId: string,
    collectionName: string
): Promise<void> => {
    if (!collectionId) throw new Error(`${collectionName} Collection ID is not configured.`);
    if (!documentId) throw new Error(`Document ID is required for deleting ${collectionName} reading.`);
    try {
        console.log(`Deleting ${collectionName} reading ${documentId}`);
        // Ensure the user making the request has delete permissions on the document.
        await databases.deleteDocument(databaseId, collectionId, documentId);
        console.log(`Successfully deleted ${collectionName} reading ${documentId}`);
    } catch (error) {
        handleAppwriteError(error, `deleting ${collectionName} reading ${documentId}`);
        throw error;
    }
};

// --- Specific Health Reading Functions using Generic Helpers ---

// Blood Pressure
export const createBloodPressureReading = (userId: string, data: CreateBPData): Promise<BloodPressureReading> =>
    createHealthReading<BloodPressureReading, CreateBPData>(userId, bloodPressureCollectionId, 'Blood Pressure', data, ['systolic', 'diastolic']);
export const getBloodPressureReadings = (userId: string, limit: number = 50): Promise<BloodPressureReading[]> =>
    getHealthReadings<BloodPressureReading>(userId, bloodPressureCollectionId, 'Blood Pressure', limit);
export const deleteBloodPressureReading = (documentId: string): Promise<void> =>
    deleteHealthReading(documentId, bloodPressureCollectionId, 'Blood Pressure');

// Blood Sugar
export const createBloodSugarReading = (userId: string, data: CreateSugarData): Promise<BloodSugarReading> =>
    createHealthReading<BloodSugarReading, CreateSugarData>(userId, bloodSugarCollectionId, 'Blood Sugar', data, ['level', 'measurementType']);
export const getBloodSugarReadings = (userId: string, limit: number = 50): Promise<BloodSugarReading[]> =>
    getHealthReadings<BloodSugarReading>(userId, bloodSugarCollectionId, 'Blood Sugar', limit);
export const deleteBloodSugarReading = (documentId: string): Promise<void> =>
    deleteHealthReading(documentId, bloodSugarCollectionId, 'Blood Sugar');

// Weight
export const createWeightReading = (userId: string, data: CreateWeightData): Promise<WeightReading> =>
    createHealthReading<WeightReading, CreateWeightData>(userId, weightCollectionId, 'Weight', data, ['weight', 'unit']);
export const getWeightReadings = (userId: string, limit: number = 50): Promise<WeightReading[]> =>
    getHealthReadings<WeightReading>(userId, weightCollectionId, 'Weight', limit);
export const deleteWeightReading = (documentId: string): Promise<void> =>
    deleteHealthReading(documentId, weightCollectionId, 'Weight');


// --- MEDICATION REMINDER FUNCTIONS ---

/**
 * Creates a new medication reminder document.
 * Validates required fields and sets permissions.
 * @param userId The Appwrite user $id.
 * @param data Data for the new reminder (name, dosage, frequency required).
 * @returns The newly created MedicationReminder object.
 * @throws Will re-throw errors after logging.
 */
export const createMedicationReminder = async (userId: string, data: CreateMedicationReminderData): Promise<MedicationReminder> => {
    if (!userId) throw new Error("User ID is required to create a medication reminder.");
    if (!medicationRemindersCollectionId) throw new Error("Medication Reminders Collection ID is not configured.");

    // Validate required fields
    if (!data.medicationName?.trim()) throw new Error("Medication Name is required.");
    if (!data.dosage?.trim()) throw new Error("Dosage is required.");
    if (!data.frequency?.trim()) throw new Error("Frequency is required.");

    try {
        const payload: Omit<MedicationReminder, keyof AppwriteDocument> = {
            userId,
            medicationName: data.medicationName.trim(),
            dosage: data.dosage.trim(),
            frequency: data.frequency.trim(),
            times: data.times?.map(t => t.trim()).filter(Boolean) || [], // Ensure times is an array, trimmed, non-empty
            notes: data.notes?.trim() || undefined,
            isActive: data.isActive ?? true, // Default to true if not provided
        };
        console.log("Creating Medication Reminder for user", userId, "with payload:", payload);

        // Define document-level permissions (owner manage)
        const userRole = Role.user(userId);
        const permissions = [
            Permission.read(userRole),
            Permission.update(userRole),
            Permission.delete(userRole),
        ];

        return await databases.createDocument<MedicationReminder>(
            databaseId,
            medicationRemindersCollectionId,
            ID.unique(),
            payload,
            permissions
        );
    } catch (error) {
        handleAppwriteError(error, `creating medication reminder for user ${userId}`);
        throw error;
    }
};

/**
 * Fetches medication reminders for a specific user.
 * Can optionally filter by active status (requires 'isActive' index).
 * Requires 'userId' index.
 * @param userId The Appwrite user $id.
 * @param onlyActive If true (default), fetches only active reminders.
 * @returns An array of MedicationReminder objects. Returns empty array on error.
 */
export const getMedicationReminders = async (userId: string, onlyActive: boolean = true): Promise<MedicationReminder[]> => {
    if (!userId) { console.warn("getMedicationReminders called with no userId."); return []; }
    if (!medicationRemindersCollectionId) {
        console.warn("Medication Reminders Collection ID not configured.");
        return [];
    }
    try {
        console.log(`Fetching medication reminders for user ${userId} (onlyActive: ${onlyActive})`);
        const queries: string[] = [
            Query.equal('userId', userId), // Ensure 'userId' is indexed
            Query.orderDesc('$createdAt'), // Show newest first
            Query.limit(50) // Sensible limit
        ];

        // Add filter for active reminders if requested (ensure 'isActive' attribute is indexed)
        if (onlyActive) {
            queries.push(Query.equal('isActive', true));
            console.log("Applying filter: isActive = true");
        }

        const response = await databases.listDocuments<MedicationReminder>(
            databaseId, medicationRemindersCollectionId, queries
        );
        console.log(`Found ${response.documents.length} medication reminders.`);
        return response.documents;
    } catch (error) {
        handleAppwriteError(error, `fetching medication reminders for user ${userId} (onlyActive: ${onlyActive})`, false);
        return [];
    }
};

/**
 * Deletes a medication reminder document by its $id.
 * @param documentId The $id of the medication reminder document to delete.
 * @throws Will re-throw errors after logging.
 */
export const deleteMedicationReminder = async (documentId: string): Promise<void> => {
    if (!medicationRemindersCollectionId) throw new Error("Medication Reminders Collection ID is not configured.");
    if (!documentId) throw new Error("Document ID is required for deleting medication reminder.");
    try {
        console.log(`Deleting medication reminder ${documentId}`);
        // Ensure the user making the request has delete permissions on the document.
        await databases.deleteDocument(databaseId, medicationRemindersCollectionId, documentId);
        console.log(`Successfully deleted medication reminder ${documentId}`);
    } catch (error) {
        handleAppwriteError(error, `deleting medication reminder ${documentId}`);
        throw error;
    }
};

/**
 * Updates an existing medication reminder document by its $id.
 * Filters undefined fields and handles 'times' array update.
 * @param documentId The $id of the medication reminder document.
 * @param data An object containing fields to update.
 * @returns The updated MedicationReminder object.
 * @throws Will re-throw errors after logging.
 */
export const updateMedicationReminder = async (documentId: string, data: Partial<Omit<MedicationReminder, keyof AppwriteDocument | 'userId'>>): Promise<MedicationReminder> => {
    if (!medicationRemindersCollectionId) throw new Error("Medication Reminders Collection ID is not configured.");
    if (!documentId) throw new Error("Medication reminder document ID is required for update.");

    try {
        const dataToUpdate = { ...data };
        delete (dataToUpdate as any).userId; // Ensure userId isn't sent

        // Filter out undefined values
        const filteredUpdateData = Object.fromEntries(
            Object.entries(dataToUpdate).filter(([_, v]) => v !== undefined)
        );

        // Ensure 'times' is an array if provided, handle null by setting to empty array
        if (filteredUpdateData.hasOwnProperty('times')) {
             if (filteredUpdateData.times === null) {
                 filteredUpdateData.times = [];
             } else if (!Array.isArray(filteredUpdateData.times)) {
                console.warn("updateMedicationReminder: 'times' provided but not as an array. Converting to empty array.");
                filteredUpdateData.times = [];
             } else {
                 // Ensure elements within the array are trimmed and non-empty
                 filteredUpdateData.times = filteredUpdateData.times.map(t => String(t ?? '').trim()).filter(Boolean);
             }
        }

        // Avoid update if no data
        if (Object.keys(filteredUpdateData).length === 0) {
            console.warn(`updateMedicationReminder called with no data for document ${documentId}.`);
            return await databases.getDocument<MedicationReminder>(databaseId, medicationRemindersCollectionId, documentId);
        }

        console.log(`Updating medication reminder ${documentId} with data:`, filteredUpdateData);
        // Ensure the user making the request has update permissions on the document.
        return await databases.updateDocument<MedicationReminder>(
            databaseId,
            medicationRemindersCollectionId,
            documentId,
            filteredUpdateData
        );
    } catch (error) {
        handleAppwriteError(error, `updating medication reminder ${documentId}`);
        throw error;
    }
};