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
const blogCollectionId: string = import.meta.env.VITE_PUBLIC_APPWRITE_BLOG_COLLECTION_ID as string; // Optional, for blog feature
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

// --- Configuration Validation ---
// Checks if essential configuration variables are present and not placeholders.
const requiredConfigs: Record<string, string> = {
    endpoint,
    projectId,
    databaseId,
    profilesCollectionId,
    appointmentsCollectionId,
    bloodPressureCollectionId,
    bloodSugarCollectionId,
    weightCollectionId,
    medicationRemindersCollectionId,
    profileBucketId,
    medicalBucketId
    // Note: blogCollectionId is optional and checked within its functions
};

const missingConfigs: string[] = Object.entries(requiredConfigs)
    .filter(([_, value]) => !value || value.startsWith('YOUR_') || value.length < 5) // Basic check for placeholder/empty
    .map(([key]) => key);

if (missingConfigs.length > 0) {
    const errorMsg = `CRITICAL ERROR: Missing or invalid Appwrite configuration for: ${missingConfigs.join(', ')}. Check .env.local and ensure all VITE_PUBLIC_APPWRITE_* variables are correctly set.`;
    console.error(errorMsg);
    // Throwing an error might be preferable in production to prevent app malfunction
    // throw new Error(errorMsg);
} else {
    //  console.log("Appwrite Config Loaded Successfully.");
     // console.log("Appwrite Config Details:", requiredConfigs); // Uncomment for debugging config values
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
    isActive?: boolean; // Reminder status
}

/**
 * Represents a user profile document. Includes basic info, pregnancy details, and preferences.
 */
export interface UserProfile extends AppwriteDocument {
    userId: string; // Links to Appwrite Auth User $id
    name?: string;
    profilePhotoId?: string; // File ID in profileBucketId
    profilePhotoUrl?: string; // Generated client-side string URL for display, not stored directly
    age?: number;
    gender?: string;
    address?: string;
    weeksPregnant?: number; // Estimated weeks
    preExistingConditions?: string; // Text description
    email?: string; // User's email (can be useful for queries)
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
 * Represents a blog post document (if blog feature is used).
 */
export interface BlogPost extends AppwriteDocument {
    title: string;
    content: string; // Can be large text/HTML
    author: string; // Consider linking to UserProfile ($id or userId)
    category?: string;
    imageUrl?: string; // Generated string URL (e.g., from storage preview)
    imageFileId?: string; // ID of the file in Appwrite Storage (optional)
    tags?: string[];
    publishedAt?: string; // ISO Datetime string
}

/**
 * Represents a medical document record linking a user to a file in storage.
 */
export interface MedicalDocument extends AppwriteDocument {
    userId: string;
    fileId: string; // ID of the file in Appwrite Storage (medicalBucketId)
    fileName: string; // Original file name
    documentType?: string; // MIME type e.g., 'application/pdf', 'image/jpeg'
    description?: string; // Optional user description
}

/**
 * Represents an appointment document.
 */
export interface Appointment extends AppwriteDocument {
    userId: string;
    date: string; // ISO Datetime string (YYYY-MM-DDTHH:mm:ss.sssZ) - Recommended for proper sorting/filtering
    time: string; // Time string (e.g., "10:00 AM", "14:30") - Potentially redundant if 'date' includes time
    notes?: string;
    isCompleted?: boolean;
    appointmentType?: string; // e.g., 'doctor', 'yoga_class', 'lab_test'
}

// --- Health Reading Types ---

/** Base interface for health readings with common fields. */
interface HealthReadingBase extends AppwriteDocument {
    userId: string;
    recordedAt: string; // ISO Datetime string when the reading was recorded
}

/** Represents a blood pressure reading document. */
export interface BloodPressureReading extends HealthReadingBase {
    systolic: number;
    diastolic: number;
}

/** Represents a blood sugar reading document. */
export interface BloodSugarReading extends HealthReadingBase {
    level: number; // Use float for potential decimals
    measurementType: 'fasting' | 'post_meal' | 'random'; // Type of measurement
}

/** Represents a weight reading document. */
export interface WeightReading extends HealthReadingBase {
    weight: number; // Use float
    unit: 'kg' | 'lbs'; // Unit of measurement
}

// --- Specific Input Types for Create Functions ---
// These types define the shape of data expected from the UI *before* internal fields (like userId, recordedAt) are added.

/** Data needed to create a new appointment. */
export type CreateAppointmentData = Pick<Appointment, 'date' | 'time'> & Partial<Pick<Appointment, 'notes' | 'appointmentType'>>;
/** Data needed to create a new blood pressure reading. */
export type CreateBPData = Pick<BloodPressureReading, 'systolic' | 'diastolic'>;
/** Data needed to create a new blood sugar reading. */
export type CreateSugarData = Pick<BloodSugarReading, 'level' | 'measurementType'>;
/** Data needed to create a new weight reading. */
export type CreateWeightData = Pick<WeightReading, 'weight' | 'unit'>;
/** Data needed to create a new medication reminder. */
export type CreateMedicationReminderData = Pick<MedicationReminder, 'medicationName' | 'dosage' | 'frequency'> & Partial<Pick<MedicationReminder, 'times' | 'notes' | 'isActive'>>;
/** Data needed to create a new blog post. */
export type CreateBlogPostData = Pick<BlogPost, 'title' | 'content' | 'author'> & Partial<Pick<BlogPost, 'category' | 'tags' | 'publishedAt' | 'imageFileId'>>;


// --- Utility Function for Error Handling ---
/**
 * Handles Appwrite exceptions, logging them and optionally re-throwing a generic error.
 * @param error The error object caught.
 * @param context A string describing the operation context (e.g., "creating account").
 * @param throwGeneric Set to true to throw a generic error after logging. Defaults to true.
 */
const handleAppwriteError = (error: unknown, context: string, throwGeneric: boolean = true): void => {
    let errorMessage = `Error ${context}: Unknown error`;
    if (error instanceof AppwriteException) {
        errorMessage = `Error ${context}: ${error.message} (Code: ${error.code}, Type: ${error.type})`;
        console.error(`AppwriteException during ${context}:`, error);
    } else if (error instanceof Error) {
        errorMessage = `Error ${context}: ${error.message}`;
        console.error(`Error during ${context}:`, error);
    } else {
        console.error(`Unknown error during ${context}:`, error);
    }

    if (throwGeneric) {
        // Throw a new error to avoid leaking detailed Appwrite exceptions potentially
        throw new Error(`Operation failed: ${context}. Please try again.`);
        // Or rethrow the original error if specific handling is needed upstream: throw error;
    }
};


// --- Authentication Functions ---

/**
 * Creates a new user account, logs them in, and creates a basic profile.
 * @returns The newly created Appwrite User object.
 */
export const createAccount = async (email: string, password: string, name: string): Promise<Models.User<Models.Preferences>> => {
    try {
        const newUserAccount = await account.create(ID.unique(), email, password, name);
        // Log in the new user immediately
        await login(email, password);
        // Attempt to create a basic profile upon signup
        try {
            await createUserProfile(newUserAccount.$id, { name: name, email: email });
            console.log(`Profile automatically created for new user ${newUserAccount.$id}`);
        } catch (profileError) {
            // Log profile creation failure but don't fail the signup process
            console.error(`Failed to auto-create profile for user ${newUserAccount.$id} after signup:`, profileError);
        }
        return newUserAccount;
    } catch (error) {
        handleAppwriteError(error, 'creating account');
        throw error; // Re-throw error after handling
    }
};

/**
 * Creates an email/password session for the user (logs them in).
 * @returns The Appwrite Session object.
 */
export const login = async (email: string, password: string): Promise<Models.Session> => {
    try {
        return await account.createEmailPasswordSession(email, password);
    } catch (error) {
        handleAppwriteError(error, 'logging in');
        throw error;
    }
};

/**
 * Deletes the current user session (logs them out).
 */
export const logout = async (): Promise<void> => {
    try {
        await account.deleteSession('current');
    } catch (error) {
        handleAppwriteError(error, 'logging out');
        throw error;
    }
};

/**
 * Retrieves the currently logged-in user object.
 * @returns The Appwrite User object or null if not logged in.
 */
export const getCurrentUser = async (): Promise<Models.User<Models.Preferences> | null> => {
    try {
        return await account.get();
    } catch (error) {
        // Appwrite throws an error if not logged in, which is expected. Return null.
        if (error instanceof AppwriteException && (error.code === 401 || error.type === 'user_unauthorized')) {
             return null;
        }
        // Log unexpected errors
        console.error("Unexpected error fetching current user:", error);
        return null;
    }
};


// --- Blog Post Functions --- (Optional Feature)

/**
 * Fetches a list of blog posts, optionally filtered by search term or category.
 * Requires blogCollectionId to be configured.
 * @returns An array of BlogPost objects.
 */
export const getBlogPosts = async (search = '', category = ''): Promise<BlogPost[]> => {
    if (!blogCollectionId || blogCollectionId.startsWith('YOUR_')) {
        console.warn("Blog Collection ID not configured. Skipping blog post fetch.");
        return [];
    }
    try {
        const queries: string[] = [Query.orderDesc('$createdAt'), Query.limit(25)];
        if (search) queries.push(Query.search('title', search)); // Ensure 'title' is indexed for search
        if (category) queries.push(Query.equal('category', category)); // Ensure 'category' is indexed for filtering

        const response = await databases.listDocuments<BlogPost>(databaseId, blogCollectionId, queries);
        return response.documents;
    } catch (error) {
        handleAppwriteError(error, 'fetching blog posts', false); // Log but don't throw generic, return empty
        return [];
    }
};

/**
 * Creates a new blog post document.
 * Requires blogCollectionId to be configured.
 * @param postData Data for the new blog post, conforming to CreateBlogPostData.
 * @returns The newly created BlogPost object.
 */
export const createBlogPost = async (postData: CreateBlogPostData): Promise<BlogPost> => {
  if (!blogCollectionId || blogCollectionId.startsWith('YOUR_')) {
      throw new Error("Blog Collection ID is not configured. Cannot create blog post.");
  }
  // **FIX:** Validate required fields directly on the input type CreateBlogPostData
  if (!postData.title || !postData.content || !postData.author) {
      throw new Error("Invalid blog post data provided. Title, content, and author are required.");
  }
  try {
      // Type assertion not strictly needed here as CreateBlogPostData matches Omit<...>
      const dataToSend: Omit<BlogPost, keyof AppwriteDocument> = postData;
      // Consider adding permissions here if only specific roles can create posts
      return await databases.createDocument<BlogPost>(
          databaseId,
          blogCollectionId,
          ID.unique(),
          dataToSend // Pass the validated data
      );
  } catch (error) {
      handleAppwriteError(error, 'creating blog post');
      throw error;
  }
};

/**
 * Fetches a single blog post by its document ID.
 * Requires blogCollectionId to be configured.
 * @param id The $id of the blog post document.
 * @returns The BlogPost object or null if not found or on error.
 */
export const getBlogPost = async (id: string): Promise<BlogPost | null> => {
    if (!blogCollectionId || blogCollectionId.startsWith('YOUR_')) {
        console.warn("Blog Collection ID not configured. Cannot get blog post.");
        return null;
    }
    if (!id) {
        console.warn("getBlogPost called with no ID.");
        return null;
    }
    try {
        return await databases.getDocument<BlogPost>(databaseId, blogCollectionId, id);
    } catch (error) {
        // Handle 404 (Not Found) gracefully
        if (error instanceof AppwriteException && error.code === 404) {
            console.log(`Blog post with ID ${id} not found.`);
            return null;
        }
        handleAppwriteError(error, `fetching blog post with ID ${id}`, false); // Log but return null
        return null;
    }
};


// --- User Profile Functions ---

/**
 * Creates a new user profile document or updates an existing one if found for the userId.
 * @param userId The Appwrite user $id.
 * @param profileData An object containing profile fields to create/update.
 * @returns The created or updated UserProfile object.
 */
export const createUserProfile = async (userId: string, profileData: Partial<Omit<UserProfile, keyof AppwriteDocument | 'userId' | 'profilePhotoUrl'>>): Promise<UserProfile> => {
    if (!profilesCollectionId || profilesCollectionId.startsWith('YOUR_')) {
        throw new Error("Profile Collection ID is not configured.");
    }
    if (!userId) throw new Error("User ID is required to create a profile.");

    try {
        // Check if profile exists to prevent duplicates and update instead
        const existingProfile = await getUserProfile(userId);
        if (existingProfile) {
            console.warn(`Profile already exists for user ${userId}. Updating instead.`);
            // Only pass the fields provided in profileData for the update
            return updateUserProfile(existingProfile.$id, profileData);
        }

        // Prepare data for creation, ensuring userId is included
        const dataToSend: Record<string, any> = { userId: userId, ...profileData };

        // Ensure dietaryPreferences is an array if provided and not already one
        if (dataToSend.dietaryPreferences && !Array.isArray(dataToSend.dietaryPreferences)) {
             console.warn("createUserProfile: dietaryPreferences provided but not as an array. Correcting to empty array before sending.");
             dataToSend.dietaryPreferences = [];
        }

        // Set document-level permissions: Only the user can manage their profile
        const userRole = Role.user(userId);
        const permissions = [
            Permission.read(userRole),
            Permission.update(userRole),
            Permission.delete(userRole)
        ];

        return await databases.createDocument<UserProfile>(
            databaseId,
            profilesCollectionId,
            ID.unique(),
            dataToSend,
            permissions
        );
    } catch (error) {
        handleAppwriteError(error, `creating/updating profile for user ${userId}`);
        throw error;
    }
};

/**
 * Fetches the user profile document associated with a given userId.
 * Generates the profile photo URL if available.
 * @param userId The Appwrite user $id.
 * @returns The UserProfile object or null if not found or on error.
 */
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
    if (!profilesCollectionId || profilesCollectionId.startsWith('YOUR_')) {
        console.error("getUserProfile Error: Profile Collection ID is not configured!");
        return null;
    }
    if (!userId) {
        console.warn("getUserProfile called with no userId.");
        return null;
    }

    try {
        const response = await databases.listDocuments<UserProfile>(
            databaseId,
            profilesCollectionId,
            [Query.equal('userId', userId), Query.limit(1)] // Query by indexed userId
        );

        if (response.documents.length > 0) {
            const profile = response.documents[0];

            // Generate profile photo URL if ID exists and bucket ID is valid
            if (profile.profilePhotoId && profileBucketId && !profileBucketId.startsWith('YOUR_')) {
                 try {
                    // **FIX:** Call getFilePreview and check for null, using a string type
                    const previewUrlObject: string | null = getFilePreview(profile.profilePhotoId, profileBucketId);
                    profile.profilePhotoUrl = previewUrlObject ? previewUrlObject : undefined;
                 } catch (previewError) {
                    // Log error but don't fail the profile fetch
                    console.error(`Error generating profile photo preview URL for user ${userId}:`, previewError);
                    profile.profilePhotoUrl = undefined; // Ensure it's undefined if preview fails
                 }
            } else {
                 profile.profilePhotoUrl = undefined; // Ensure it's undefined if no photoId or bucketId
            }

            // Ensure array fields are arrays, even if Appwrite returns null
             if (!Array.isArray(profile.dietaryPreferences)) {
                 profile.dietaryPreferences = [];
             }

            return profile;
        } else {
            return null; // No profile found for this userId
        }
    } catch (error) {
        handleAppwriteError(error, `fetching profile for user ${userId}`, false); // Log but return null
        return null;
    }
};

/**
 * Updates an existing user profile document.
 * @param profileDocumentId The $id of the profile document to update.
 * @param profileData An object containing the profile fields to update.
 * @returns The updated UserProfile object.
 */
export const updateUserProfile = async (profileDocumentId: string, profileData: Partial<Omit<UserProfile, keyof AppwriteDocument | 'userId' | 'profilePhotoUrl'>>): Promise<UserProfile> => {
     if (!profilesCollectionId || profilesCollectionId.startsWith('YOUR_')) {
         throw new Error("Profile Collection ID is not configured.");
     }
     if (!profileDocumentId) throw new Error("Profile document ID is required for update.");

    try {
        // Create a mutable copy and remove fields that shouldn't be updated directly
        const dataToUpdate = { ...profileData };
        delete (dataToUpdate as any).userId; // Prevent accidental userId update
        delete (dataToUpdate as any).email; // Typically email shouldn't be updated here

        // Filter out undefined values to prevent unintentionally clearing fields
        // Allow null to be sent if a field needs to be explicitly cleared (Appwrite handles null for optional fields)
        const filteredUpdateData = Object.fromEntries(
            Object.entries(dataToUpdate).filter(([_, v]) => v !== undefined)
        );

        // Handle array fields specifically: if null is passed, send empty array to clear
        if (filteredUpdateData.hasOwnProperty('dietaryPreferences')) {
            if (filteredUpdateData.dietaryPreferences === null) {
                 filteredUpdateData.dietaryPreferences = []; // Send empty array to clear in Appwrite
            } else if (!Array.isArray(filteredUpdateData.dietaryPreferences)) {
                 // If it's provided but not an array, log a warning and remove it to avoid Appwrite error
                 console.warn("updateUserProfile: dietaryPreferences provided but not as an array. Skipping update for this field.");
                 delete filteredUpdateData.dietaryPreferences;
            }
        }

        // Avoid making an update call if no actual data is being changed
        if (Object.keys(filteredUpdateData).length === 0) {
            console.warn("updateUserProfile called with no data to update.");
            // Fetch and return the current profile state
             return await databases.getDocument<UserProfile>(databaseId, profilesCollectionId, profileDocumentId);
        }

        // Perform the update
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
 * @param file The File object to upload.
 * @returns The Appwrite File object representing the uploaded file.
 */
export const uploadProfilePhoto = async (file: File, userId: string): Promise<Models.File> => {
    if (!profileBucketId || profileBucketId.startsWith('YOUR_')) {
        throw new Error("Profile Photo Bucket ID is not configured.");
    }
    if (!file) throw new Error("No file provided for upload.");
    if (!userId) throw new Error("User ID is required to set permissions for profile photo."); // Add check

    try {
        // Define permissions: Grant read access ONLY to the user who owns it
        const userRole = Role.user(userId);
        const permissions = [
            Permission.read(userRole),
            // Optional: Allow user to update/delete their own photo file directly if needed
            // Permission.update(userRole),
            // Permission.delete(userRole)
        ];

        console.log(`Uploading profile photo for user ${userId} with permissions:`, permissions); // Debug log

        return await storage.createFile(
            profileBucketId,
            ID.unique(), // Generate a unique ID for the file
            file,
            permissions // Pass permissions array here
        );
    } catch (error) {
        handleAppwriteError(error, 'uploading profile photo');
        throw error;
    }
};


// --- Medical Document Functions ---

/**
 * Uploads a medical document file and creates a corresponding record in the database.
 * @param file The File object to upload.
 * @param userId The ID of the user uploading the document.
 * @param description Optional description for the document.
 * @returns The Appwrite File object representing the uploaded file.
 */
export const uploadMedicalDocument = async (file: File, userId: string, description?: string): Promise<Models.File> => {
    // Validate required parameters and configuration
    if (!userId) throw new Error("User ID is required for uploading medical document.");
    if (!medicalBucketId || medicalBucketId.startsWith('YOUR_')) throw new Error("Medical Bucket ID not configured.");
    if (!medicalDocumentsCollectionId || medicalDocumentsCollectionId.startsWith('YOUR_')) throw new Error("Medical Docs Collection ID not configured.");
    if (!file) throw new Error("No file provided for medical document upload.");

    let uploadedFile: Models.File | null = null;
    try {
        // Define file-level permissions (only owner can read/delete)
        const userRole = Role.user(userId);
        const filePermissions = [
             Permission.read(userRole),
             Permission.update(userRole), // Often not needed for uploads, but can allow renaming
             Permission.delete(userRole)
        ];

        // 1. Upload the file to storage
        uploadedFile = await storage.createFile(
            medicalBucketId,
            ID.unique(),
            file,
            filePermissions
        );

        // 2. Create the corresponding document in the database
        const docData: Omit<MedicalDocument, keyof AppwriteDocument> = {
             userId,
             fileId: uploadedFile.$id,
             fileName: file.name,
             documentType: file.type || 'application/octet-stream', // Fallback MIME type
             description: description || undefined
        };
        // Define document-level permissions (matching file permissions)
        const docPermissions = [
             Permission.read(userRole),
             Permission.update(userRole), // Allow user to update description
             Permission.delete(userRole)
        ];

        await databases.createDocument<MedicalDocument>(
            databaseId,
            medicalDocumentsCollectionId,
            ID.unique(),
            docData,
            docPermissions
        );

        return uploadedFile; // Return the file object on success

    } catch (error) {
        // Cleanup: If file was uploaded but DB record creation failed, delete the orphaned file
        if (uploadedFile?.$id) {
            console.warn(`Database record creation failed after file upload (${uploadedFile.$id}). Attempting to delete orphaned file.`);
            try {
                await storage.deleteFile(medicalBucketId, uploadedFile.$id);
                console.log(`Orphaned file ${uploadedFile.$id} deleted successfully.`);
            } catch (deleteError) {
                // Log cleanup failure, but prioritize throwing the original error
                console.error(`CRITICAL: Failed to delete orphaned file ${uploadedFile.$id} after upload error. Manual cleanup required. Delete Error:`, deleteError);
            }
        }
        handleAppwriteError(error, `uploading medical document for user ${userId}`);
        throw error; // Re-throw the original error
    }
};

/**
 * Fetches all medical document records for a specific user.
 * @param userId The Appwrite user $id.
 * @returns An array of MedicalDocument objects.
 */
export const getUserMedicalDocuments = async (userId: string): Promise<MedicalDocument[]> => {
    if (!userId) { console.warn("getUserMedicalDocuments called with no userId."); return []; }
    if (!medicalDocumentsCollectionId || medicalDocumentsCollectionId.startsWith('YOUR_')) {
        console.warn("Medical Docs Collection ID not configured. Cannot fetch documents.");
        return [];
    }
    try {
        const response = await databases.listDocuments<MedicalDocument>(
            databaseId, medicalDocumentsCollectionId,
            [
                Query.equal('userId', userId),
                Query.orderDesc('$createdAt'), // Show newest first
                Query.limit(100) // Add a sensible limit
            ]
        );
        return response.documents;
    } catch (error) {
        handleAppwriteError(error, `fetching medical documents for user ${userId}`, false);
        return []; // Return empty array on error
    }
};

/**
 * Deletes a medical document record from the database and the corresponding file from storage.
 * @param document The MedicalDocument object to delete.
 */
export const deleteMedicalDocument = async (document: MedicalDocument): Promise<void> => {
     // Validate input
     if (!document?.$id || !document?.fileId) throw new Error("Invalid medical document data provided for deletion.");
     if (!medicalBucketId || medicalBucketId.startsWith('YOUR_')) throw new Error("Medical Bucket ID not configured.");
     if (!medicalDocumentsCollectionId || medicalDocumentsCollectionId.startsWith('YOUR_')) throw new Error("Medical Docs Collection ID not configured.");

    try {
        // 1. Delete the file from storage first (more critical to avoid orphans)
        await storage.deleteFile(medicalBucketId, document.fileId);
        // 2. Delete the document record from the database
        await databases.deleteDocument(databaseId, medicalDocumentsCollectionId, document.$id);
        console.log(`Successfully deleted medical document ${document.$id} and file ${document.fileId}`);
    } catch (error) {
        // Note: If DB delete fails after file delete, manual DB cleanup might be needed.
        handleAppwriteError(error, `deleting medical document ${document.$id}`);
        throw error;
    }
};


// --- File Utility Functions ---

/**
 * Gets a preview URL for a file in a specified bucket.
 * @param fileId The $id of the file in Appwrite Storage.
 * @param bucketIdToUse The ID of the bucket containing the file.
 * @returns A URL string for the file view, or null if IDs are invalid or an error occurs.
 */
export const getFilePreview = (fileId: string, bucketIdToUse: string): string | null => {
    if (!fileId || !bucketIdToUse || bucketIdToUse.startsWith('YOUR_')) {
        console.error("getFilePreview requires a valid fileId and configured bucketId.");
        return null;
    }
    try {
        // Use getFileView instead of getFilePreview to avoid transformations
        return storage.getFileView(bucketIdToUse, fileId);
    } catch (error) {
         console.error(`Error getting file view for ${fileId}:`, error);
         return null;
    }
};


// --- Appointment Functions ---

/**
 * Creates a new appointment document for a user.
 * @param userId The Appwrite user $id.
 * @param appointmentData Data for the new appointment.
 * @returns The newly created Appointment object.
 */
export const createAppointment = async (userId: string, appointmentData: CreateAppointmentData): Promise<Appointment> => {
     if (!userId) throw new Error("User ID is required to create an appointment.");
     if (!appointmentsCollectionId || appointmentsCollectionId.startsWith('YOUR_')) {
         throw new Error("Appointments Collection ID is not configured.");
     }
     // Basic validation of input data
     if (!appointmentData || !appointmentData.date || !appointmentData.time) {
         throw new Error("Appointment date and time are required.");
     }
     // Consider adding validation for date/time format if needed

    try {
        // Prepare data, setting defaults
        const dataToCreate: Omit<Appointment, keyof AppwriteDocument> = {
            userId: userId,
            date: appointmentData.date, // Store date (ideally as full ISO datetime)
            time: appointmentData.time, // Store time string (consider merging into date)
            isCompleted: false, // Default status
            appointmentType: appointmentData.appointmentType || 'general', // Default type
            notes: appointmentData.notes || undefined,
        };

        // Define document-level permissions
        const userRole = Role.user(userId);
        const permissions = [
            Permission.read(userRole),
            Permission.update(userRole),
            Permission.delete(userRole)
        ];

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
 * Fetches all appointments for a specific user, sorted by date and time.
 * @param userId The Appwrite user $id.
 * @returns An array of Appointment objects.
 */
export const getUserAppointments = async (userId: string): Promise<Appointment[]> => {
  if (!userId) { console.warn("getUserAppointments called with no userId."); return []; }
  if (!appointmentsCollectionId || appointmentsCollectionId.startsWith('YOUR_')) {
      console.warn("Appointments Collection ID not configured. Cannot fetch appointments.");
      return [];
  }
 try {
     // Ensure 'date' attribute is indexed in Appwrite for sorting
     const response = await databases.listDocuments<Appointment>(
         databaseId, appointmentsCollectionId,
         [
             Query.equal('userId', userId),
             Query.orderAsc('date'), // Primary sort: by date (ensure 'date' is indexed and ideally datetime)
             // Query.orderAsc('time'), // Secondary sort: by time (less reliable if 'time' is just a string, better to sort by full datetime 'date')
             Query.limit(100) // Sensible limit
         ]
     );
     return response.documents;
 } catch (error) {
     handleAppwriteError(error, `fetching appointments for user ${userId}`, false);
     return []; // Return empty array on error
 }
};

/**
 * Updates an existing appointment document.
 * @param appointmentDocumentId The $id of the appointment document.
 * @param appointmentData An object containing fields to update.
 * @returns The updated Appointment object.
 */
export const updateAppointment = async (appointmentDocumentId: string, appointmentData: Partial<Omit<Appointment, keyof AppwriteDocument | 'userId'>>): Promise<Appointment> => {
     if (!appointmentsCollectionId || appointmentsCollectionId.startsWith('YOUR_')) throw new Error("Appointments Collection ID not configured.");
     if (!appointmentDocumentId) throw new Error("Appointment document ID is required for update.");

    try {
        const dataToUpdate = { ...appointmentData };
        delete (dataToUpdate as any).userId; // Ensure userId isn't sent

        // Filter out undefined values
        const filteredUpdateData = Object.fromEntries(
            Object.entries(dataToUpdate).filter(([_, v]) => v !== undefined)
        );

        if (Object.keys(filteredUpdateData).length === 0) {
             console.warn("updateAppointment called with no data to update.");
             return await databases.getDocument<Appointment>(databaseId, appointmentsCollectionId, appointmentDocumentId);
        }

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
 * Deletes an appointment document.
 * @param appointmentDocumentId The $id of the appointment document to delete.
 */
export const deleteAppointment = async (appointmentDocumentId: string): Promise<void> => {
     if (!appointmentsCollectionId || appointmentsCollectionId.startsWith('YOUR_')) throw new Error("Appointments Collection ID not configured.");
     if (!appointmentDocumentId) throw new Error("Appointment document ID is required for deletion.");
    try {
        await databases.deleteDocument(databaseId, appointmentsCollectionId, appointmentDocumentId);
        console.log(`Successfully deleted appointment ${appointmentDocumentId}`);
    } catch (error) {
        handleAppwriteError(error, `deleting appointment ${appointmentDocumentId}`);
        throw error;
    }
};


// --- Health Reading Functions (Refactored) ---

// Common function to create any health reading
const createHealthReading = async <T extends HealthReadingBase, D>(
    userId: string,
    collectionId: string,
    collectionName: string, // For error messages
    data: D,
    requiredFields: (keyof D)[]
): Promise<T> => {
    if (!userId) throw new Error(`User ID is required to create ${collectionName} reading.`);
    if (!collectionId || collectionId.startsWith('YOUR_')) {
        throw new Error(`${collectionName} Collection ID is not configured.`);
    }
    // Validate required fields in the input data
    for (const field of requiredFields) {
        const value = data[field]; // Use index signature for dynamic access
        if (value === null || value === undefined) {
             throw new Error(`Field '${String(field)}' is required for ${collectionName}.`);
        }
        if (typeof value === 'number' && value <= 0) {
             throw new Error(`Field '${String(field)}' must be positive for ${collectionName}.`);
        }
        if (typeof value === 'string' && !value.trim()) {
             throw new Error(`Field '${String(field)}' cannot be empty for ${collectionName}.`);
        }
    }

    try {
        // **FIX:** Use type assertion for payload to satisfy createDocument's generic type
        const payload = {
            userId,
            ...data,
            recordedAt: new Date().toISOString(), // Add timestamp
        } as Omit<T, keyof AppwriteDocument>; // Assert structure matches required type

        // Define document-level permissions
        const userRole = Role.user(userId);
        const permissions = [
            Permission.read(userRole),
            Permission.update(userRole), // Might not be needed if readings are immutable
            Permission.delete(userRole)
        ];

        return await databases.createDocument<T>(
            databaseId,
            collectionId,
            ID.unique(),
            payload, // Pass the asserted payload
            permissions
        );
    } catch (error) {
        handleAppwriteError(error, `creating ${collectionName} reading for user ${userId}`);
        throw error;
    }
};

// Common function to get health readings
const getHealthReadings = async <T extends HealthReadingBase>(
    userId: string,
    collectionId: string,
    collectionName: string,
    limit: number = 50
): Promise<T[]> => {
    if (!userId) { console.warn(`getHealthReadings (${collectionName}) called with no userId.`); return []; }
    if (!collectionId || collectionId.startsWith('YOUR_')) {
        console.warn(`${collectionName} Collection ID not configured. Cannot fetch readings.`);
        return [];
    }
    try {
        // Ensure 'recordedAt' attribute is indexed in Appwrite for sorting
        const response = await databases.listDocuments<T>(
            databaseId, collectionId,
            [
                Query.equal('userId', userId),
                Query.orderDesc('recordedAt'), // Fetch newest first
                Query.limit(limit)
            ]
        );
        return response.documents;
    } catch (error) {
        handleAppwriteError(error, `fetching ${collectionName} readings for user ${userId}`, false);
        return [];
    }
};

// Common function to delete a health reading
const deleteHealthReading = async (
    documentId: string,
    collectionId: string,
    collectionName: string
): Promise<void> => {
    if (!collectionId || collectionId.startsWith('YOUR_')) {
        throw new Error(`${collectionName} Collection ID is not configured.`);
    }
    if (!documentId) throw new Error(`Document ID is required for deleting ${collectionName} reading.`);
    try {
        await databases.deleteDocument(databaseId, collectionId, documentId);
        console.log(`Successfully deleted ${collectionName} reading ${documentId}`);
    } catch (error) {
        handleAppwriteError(error, `deleting ${collectionName} reading ${documentId}`);
        throw error;
    }
};

// Blood Pressure Specific Functions
export const createBloodPressureReading = (userId: string, data: CreateBPData): Promise<BloodPressureReading> =>
    createHealthReading<BloodPressureReading, CreateBPData>(userId, bloodPressureCollectionId, 'Blood Pressure', data, ['systolic', 'diastolic']);
export const getBloodPressureReadings = (userId: string, limit: number = 50): Promise<BloodPressureReading[]> =>
    getHealthReadings<BloodPressureReading>(userId, bloodPressureCollectionId, 'Blood Pressure', limit);
export const deleteBloodPressureReading = (documentId: string): Promise<void> =>
    deleteHealthReading(documentId, bloodPressureCollectionId, 'Blood Pressure');

// Blood Sugar Specific Functions
export const createBloodSugarReading = (userId: string, data: CreateSugarData): Promise<BloodSugarReading> =>
    createHealthReading<BloodSugarReading, CreateSugarData>(userId, bloodSugarCollectionId, 'Blood Sugar', data, ['level', 'measurementType']);
export const getBloodSugarReadings = (userId: string, limit: number = 50): Promise<BloodSugarReading[]> =>
    getHealthReadings<BloodSugarReading>(userId, bloodSugarCollectionId, 'Blood Sugar', limit);
export const deleteBloodSugarReading = (documentId: string): Promise<void> =>
    deleteHealthReading(documentId, bloodSugarCollectionId, 'Blood Sugar');

// Weight Specific Functions
export const createWeightReading = (userId: string, data: CreateWeightData): Promise<WeightReading> =>
    createHealthReading<WeightReading, CreateWeightData>(userId, weightCollectionId, 'Weight', data, ['weight', 'unit']);
export const getWeightReadings = (userId: string, limit: number = 50): Promise<WeightReading[]> =>
    getHealthReadings<WeightReading>(userId, weightCollectionId, 'Weight', limit);
export const deleteWeightReading = (documentId: string): Promise<void> =>
    deleteHealthReading(documentId, weightCollectionId, 'Weight');


// --- MEDICATION REMINDER FUNCTIONS ---

/**
 * Creates a new medication reminder document.
 * @param userId The Appwrite user $id.
 * @param data Data for the new reminder.
 * @returns The newly created MedicationReminder object.
 */
export const createMedicationReminder = async (userId: string, data: CreateMedicationReminderData): Promise<MedicationReminder> => {
    if (!userId) throw new Error("User ID is required.");
    if (!medicationRemindersCollectionId || medicationRemindersCollectionId.startsWith('YOUR_')) {
        throw new Error("Medication Reminders Collection ID is not configured.");
    }
    if (!data.medicationName || !data.dosage || !data.frequency) {
        throw new Error("Medication Name, Dosage, and Frequency are required.");
    }

    try {
        const payload: Omit<MedicationReminder, keyof AppwriteDocument> = {
            userId,
            medicationName: data.medicationName,
            dosage: data.dosage,
            frequency: data.frequency,
            times: data.times || [], // Ensure times is an array, default to empty
            notes: data.notes || undefined,
            isActive: data.isActive !== undefined ? data.isActive : true, // Default to true if not provided
        };
        console.log("Creating Medication Reminder with payload:", payload);

        // Define document-level permissions
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
 * @param userId The Appwrite user $id.
 * @param onlyActive If true (default), fetches only active reminders.
 * @returns An array of MedicationReminder objects.
 */
export const getMedicationReminders = async (userId: string, onlyActive: boolean = true): Promise<MedicationReminder[]> => {
    if (!userId) { console.warn("getMedicationReminders called with no userId."); return []; }
    if (!medicationRemindersCollectionId || medicationRemindersCollectionId.startsWith('YOUR_')) {
        console.warn("Medication Reminders Collection ID not configured.");
        return [];
    }
    try {
        const queries: string[] = [
            Query.equal('userId', userId),
            Query.orderDesc('$createdAt'), // Show newest first
            Query.limit(50) // Sensible limit
        ];

        // Add filter for active reminders if requested
        if (onlyActive) {
            queries.push(Query.equal('isActive', true)); // Ensure 'isActive' attribute is indexed
        }

        const response = await databases.listDocuments<MedicationReminder>(
            databaseId, medicationRemindersCollectionId, queries
        );
        return response.documents;
    } catch (error) {
        handleAppwriteError(error, `fetching medication reminders for user ${userId}`, false);
        return [];
    }
};

/**
 * Deletes a medication reminder document.
 * @param documentId The $id of the medication reminder document to delete.
 */
export const deleteMedicationReminder = async (documentId: string): Promise<void> => {
    if (!medicationRemindersCollectionId || medicationRemindersCollectionId.startsWith('YOUR_')) {
        throw new Error("Medication Reminders Collection ID is not configured.");
    }
    if (!documentId) throw new Error("Document ID is required for deletion.");
    try {
        await databases.deleteDocument(databaseId, medicationRemindersCollectionId, documentId);
        console.log(`Successfully deleted medication reminder ${documentId}`);
    } catch (error) {
        handleAppwriteError(error, `deleting medication reminder ${documentId}`);
        throw error;
    }
};