// src/lib/appwrite.ts
import { Account, Avatars, Client, Databases, ID, Query, Storage, Models } from 'appwrite';

// --- Configuration ---

// Ensure your .env.local file (for Vite) has these variables defined CORRECTLY
const endpoint = import.meta.env.VITE_PUBLIC_APPWRITE_ENDPOINT as string;
const projectId = import.meta.env.VITE_PUBLIC_APPWRITE_PROJECT_ID as string;
const blogDatabaseId = import.meta.env.VITE_PUBLIC_APPWRITE_BLOG_DATABASE_ID as string; // Assuming this is your main DB
const blogCollectionId = import.meta.env.VITE_PUBLIC_APPWRITE_BLOG_COLLECTION_ID as string;

// --- EXPORT these IDs so they can be imported elsewhere ---
export const profileBucketId = import.meta.env.VITE_PUBLIC_APPWRITE_PROFILE_BUCKET_ID as string;
export const medicalBucketId = import.meta.env.VITE_PUBLIC_APPWRITE_MEDICAL_BUCKET_ID as string;
// ---

// **CHECK THESE IN .env.local and Appwrite Console**
const profilesCollectionId = import.meta.env.VITE_PUBLIC_APPWRITE_PROFILES_COLLECTION_ID as string;
const medicalDocumentsCollectionId = import.meta.env.VITE_PUBLIC_APPWRITE_MEDICAL_DOCUMENTS_COLLECTION_ID as string;
const appointmentsCollectionId = import.meta.env.VITE_PUBLIC_APPWRITE_APPOINTMENTS_COLLECTION_ID as string;

// Basic validation (Good practice)
if (!endpoint || !projectId || !blogDatabaseId || !blogCollectionId || !profileBucketId || !medicalBucketId || !profilesCollectionId || !medicalDocumentsCollectionId || !appointmentsCollectionId) {
    console.error("CRITICAL ERROR: Missing required Appwrite environment variables! Check .env.local and restart the server.");
    // Optionally throw an error to halt execution if these are critical
    // throw new Error("Missing required Appwrite environment variables!");
} else {
    // Optional: Log values during development to confirm they are loaded (remove in production)
    // console.log("Appwrite Config Loaded:", { endpoint, projectId, blogDatabaseId, blogCollectionId, profileBucketId, medicalBucketId, profilesCollectionId, medicalDocumentsCollectionId, appointmentsCollectionId });
}


// --- Appwrite Client Initialization ---
const client = new Client();
client
    .setEndpoint(endpoint)
    .setProject(projectId);

// --- Service Exports ---
export const account = new Account(client);
export const avatars = new Avatars(client);
export const databases = new Databases(client);
export const storage = new Storage(client);

// --- Type Definitions (Define shapes for your data) ---

// Base Appwrite document model
export interface AppwriteDocument extends Models.Document {
    // Add any common fields if necessary
}

// Specific document types extending the base
// Ensure these match the attributes defined in your Appwrite collections
export interface UserProfile extends AppwriteDocument {
    userId: string;
    name?: string;
    profilePhotoId?: string; // Store file ID
    profilePhotoUrl?: string; // Store preview URL if needed, generated on fetch
    age?: number;
    gender?: string;
    address?: string;
    // Ensure attribute key matches: 'monthOfConception' or 'approxMonthOfConceive'?
    // Using 'monthOfConception' based on your config file example
    monthOfConception?: string;
    preExistingConditions?: string;
    email?: string; // Usually derived from account, can store if needed
    phoneNumber?: string;
}

export interface BlogPost extends AppwriteDocument {
    title: string;
    content: string;
    author: string;
    category?: string;
    imageUrl?: string;
    imageFileId?: string;
    tags?: string[];
    publishedAt?: string; // Should be datetime in Appwrite
}

export interface MedicalDocument extends AppwriteDocument {
    userId: string;
    fileId: string;
    fileName: string;
    documentType?: string; // Make optional if not always present
    description?: string; // Added based on your config file example
}

export interface Appointment extends AppwriteDocument {
    userId: string;
    date: string; // ISO Date string recommended
    time: string; // Store time separately if needed, e.g., "10:00"
    notes?: string;
    isCompleted?: boolean; // Make optional if default is handled by Appwrite
}

// --- Authentication Functions ---

/**
 * Creates a new user account and logs them in.
 */
export const createAccount = async (email: string, password: string, name: string): Promise<Models.User<Models.Preferences>> => {
    try {
        const newUserAccount = await account.create(ID.unique(), email, password, name);
        await login(email, password);
        return newUserAccount;
    } catch (error) {
        console.error("Error creating account:", error);
        throw error;
    }
};

/**
 * Logs a user in using email and password.
 */
export const login = async (email: string, password: string): Promise<Models.Session> => {
    try {
        return await account.createEmailPasswordSession(email, password);
    } catch (error) {
        console.error("Error logging in:", error);
        throw error;
    }
};

/**
 * Logs the current user out.
 */
export const logout = async (): Promise<void> => {
    try {
        await account.deleteSession('current');
    } catch (error) {
        console.error("Error logging out:", error);
        throw error;
    }
};

/**
 * Gets the currently logged-in user account, if any.
 * Returns null if no user is logged in or an error occurs.
 */
export const getCurrentUser = async (): Promise<Models.User<Models.Preferences> | null> => {
    try {
        return await account.get();
    } catch (error) {
        return null; // Expected if not logged in
    }
};

// --- Blog Post Functions ---

/**
 * Fetches blog posts, optionally filtering by search term or category.
 */
export const getBlogPosts = async (search = '', category = ''): Promise<BlogPost[]> => {
    try {
        const queries: string[] = [Query.orderDesc('$createdAt')];
        if (search) queries.push(Query.search('title', search)); // Ensure 'title' is indexed for search
        if (category) queries.push(Query.equal('category', category));

        const response = await databases.listDocuments<BlogPost>(
            blogDatabaseId,
            blogCollectionId,
            queries
        );
        return response.documents;
    } catch (error) {
        console.error("Error fetching blog posts:", error);
        return [];
    }
};

/**
 * Creates a new blog post.
 */
export const createBlogPost = async (postData: Omit<BlogPost, keyof AppwriteDocument | 'imageUrl'> & { imageFileId?: string }): Promise<BlogPost> => {
  try {
      // This expects 'postData' to be an OBJECT
      return await databases.createDocument<BlogPost>(
          blogDatabaseId,
          blogCollectionId,
          ID.unique(),
          postData // <--- This must be an object
      );
  } catch (error) {
      console.error("Error creating blog post:", error);
      throw error;
  }
};

/**
 * Fetches a single blog post by its ID.
 */
export const getBlogPost = async (id: string): Promise<BlogPost | null> => {
    try {
        return await databases.getDocument<BlogPost>(
            blogDatabaseId,
            blogCollectionId,
            id
        );
    } catch (error) {
        console.error(`Error fetching blog post with ID ${id}:`, error);
        return null;
    }
};

// --- User Profile Functions ---

/**
 * Creates a user profile document linked to a userId.
 */
export const createUserProfile = async (userId: string, profileData: Partial<Omit<UserProfile, keyof AppwriteDocument | 'userId' | 'profilePhotoUrl'>>): Promise<UserProfile> => {
    if (!profilesCollectionId) throw new Error("Profile Collection ID is not configured.");
    try {
        const existingProfile = await getUserProfile(userId);
        if (existingProfile) {
            console.warn(`Profile already exists for user ${userId}. Consider updating instead.`);
            // Optionally update here or return existing
            return updateUserProfile(existingProfile.$id, profileData);
            // throw new Error(`Profile already exists for user ${userId}`);
        }

        return await databases.createDocument<UserProfile>(
            blogDatabaseId,
            profilesCollectionId,
            ID.unique(),
            { userId: userId, ...profileData }
            // Add permissions if needed: [ Permission.read(Role.user(userId)), ... ]
        );
    } catch (error) {
        console.error("Error creating user profile:", error);
        throw error;
    }
};

/**
 * Fetches the user profile document associated with a userId.
 */
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
    // **DEBUG CHECK:** Ensure profilesCollectionId has a value here
    if (!profilesCollectionId) {
        console.error("getUserProfile Error: Profile Collection ID is undefined or empty!");
        return null;
    }
    // console.log(`DEBUG: Fetching profile for user ${userId} from collection ${profilesCollectionId}`); // Temporary debug log

    try {
        const response = await databases.listDocuments<UserProfile>(
            blogDatabaseId,
            profilesCollectionId, // Make sure this is correct
            [
                Query.equal('userId', userId),
                Query.limit(1)
            ]
        );

        if (response.documents.length > 0) {
            const profile = response.documents[0];
            // Generate profile photo URL if ID exists
            if (profile.profilePhotoId) {
                 try {
                    profile.profilePhotoUrl = getFilePreview(profile.profilePhotoId, profileBucketId).toString();
                 } catch (previewError) {
                    console.error("Error generating profile photo preview URL:", previewError);
                    profile.profilePhotoUrl = undefined; // Set to undefined if preview fails
                 }
            }
            return profile;
        } else {
            return null;
        }
    } catch (error) {
        console.error("Error fetching user profile:", error); // Log the actual error
        return null;
    }
};

/**
 * Updates an existing user profile document.
 */
export const updateUserProfile = async (profileDocumentId: string, profileData: Partial<Omit<UserProfile, keyof AppwriteDocument | 'userId' | 'profilePhotoUrl'>>): Promise<UserProfile> => {
     if (!profilesCollectionId) throw new Error("Profile Collection ID is not configured.");
    try {
        return await databases.updateDocument<UserProfile>(
            blogDatabaseId,
            profilesCollectionId,
            profileDocumentId,
            profileData
        );
    } catch (error) {
        console.error("Error updating user profile:", error);
        throw error;
    }
};

/**
 * Uploads a profile photo to the profile bucket.
 * Returns the Appwrite File object.
 */
export const uploadProfilePhoto = async (file: File): Promise<Models.File> => {
    // **DEBUG CHECK:** Ensure profileBucketId has a value here
    if (!profileBucketId) {
        console.error("uploadProfilePhoto Error: Profile Bucket ID is undefined or empty!");
        throw new Error("Profile Bucket ID is not configured.");
    }
    // console.log(`DEBUG: Uploading to bucket ${profileBucketId}`); // Temporary debug log

    try {
        return await storage.createFile(
            profileBucketId, // Make sure this ID is correct and exists in Appwrite
            ID.unique(),
            file
            // Add file-level permissions if bucket permissions are not sufficient
            // [ Permission.read(Role.user(userId)), ... ] // Need userId if setting permissions here
        );
    } catch (error) {
        console.error("Error uploading profile photo:", error); // Log the actual error
        throw error;
    }
};


// --- Medical Document Functions ---

/**
 * Uploads a medical document file and creates a corresponding record
 * linking it to the user.
 */
export const uploadMedicalDocument = async (file: File, userId: string): Promise<Models.File> => {
    if (!userId) throw new Error("User ID is required to upload medical documents.");
    if (!medicalBucketId) throw new Error("Medical Bucket ID is not configured.");
    if (!medicalDocumentsCollectionId) throw new Error("Medical Documents Collection ID is not configured.");

    let uploadedFile: Models.File | null = null; // Keep track of uploaded file for potential cleanup
    try {
        // 1. Upload file
        uploadedFile = await storage.createFile(
            medicalBucketId,
            ID.unique(),
            file
            // Add file-level permissions if needed: [ Permission.read(Role.user(userId)), ... ]
        );

        // 2. Create database record
        await databases.createDocument<MedicalDocument>(
            blogDatabaseId,
            medicalDocumentsCollectionId,
            ID.unique(),
            {
                userId: userId,
                fileId: uploadedFile.$id,
                fileName: file.name,
                documentType: file.type || 'application/octet-stream',
                // description: '' // Add if needed
            }
            // Add document-level permissions: [ Permission.read(Role.user(userId)), ... ]
        );

        return uploadedFile;
    } catch (error) {
        console.error("Error uploading medical document:", error);
        // Attempt to delete the orphaned file if DB record creation failed
        if (uploadedFile?.$id) {
            try {
                console.warn(`Attempting to delete orphaned file: ${uploadedFile.$id}`);
                await storage.deleteFile(medicalBucketId, uploadedFile.$id);
            } catch (deleteError) {
                console.error(`Failed to delete orphaned file ${uploadedFile.$id}:`, deleteError);
            }
        }
        throw error;
    }
};


/**
 * Fetches the list of medical document records for a specific user.
 */
export const getUserMedicalDocuments = async (userId: string): Promise<MedicalDocument[]> => {
    if (!userId) return [];
    if (!medicalDocumentsCollectionId) throw new Error("Medical Documents Collection ID is not configured.");

    try {
        const response = await databases.listDocuments<MedicalDocument>(
            blogDatabaseId,
            medicalDocumentsCollectionId,
            [
                Query.equal('userId', userId),
                Query.orderDesc('$createdAt')
            ]
        );
        return response.documents;
    } catch (error) {
        console.error("Error fetching user medical documents:", error);
        return [];
    }
};


// --- File Utility Functions ---

/**
 * Gets a preview URL for a file in a specific bucket.
 */
export const getFilePreview = (fileId: string, bucketIdToUse: string): URL => {
    if (!fileId || !bucketIdToUse) {
        console.error("getFilePreview requires both fileId and bucketId.");
        return new URL("about:blank"); // Avoid crashing
    }
    try {
        // Ensure bucketIdToUse is valid before calling
        const previewUrl = storage.getFilePreview(bucketIdToUse, fileId);
        return new URL(previewUrl); // Convert string URL to URL object
    } catch (error) {
         console.error(`Error getting file preview for ${fileId} in bucket ${bucketIdToUse}:`, error);
         return new URL("about:blank");
    }
};

/**
 * Deletes a file from a specified bucket AND its associated DB record.
 * (Example for Medical Docs - adapt for other types if needed)
 */
export const deleteMedicalDocument = async (document: MedicalDocument): Promise<void> => {
     if (!document?.$id || !document?.fileId) {
        throw new Error("Invalid document data provided for deletion.");
     }
     if (!medicalBucketId) throw new Error("Medical Bucket ID is not configured.");
     if (!medicalDocumentsCollectionId) throw new Error("Medical Documents Collection ID is not configured.");

    try {
        // 1. Delete the file from storage
        await storage.deleteFile(medicalBucketId, document.fileId);
        // 2. Delete the database record
        await databases.deleteDocument(blogDatabaseId, medicalDocumentsCollectionId, document.$id);
    } catch (error) {
        console.error(`Error deleting medical document ${document.$id} (file: ${document.fileId}):`, error);
        // Consider more nuanced error handling (e.g., what if file deleted but DB record failed?)
        throw error;
    }
};


// --- Appointment Functions ---

/**
 * Creates a new appointment record for a user.
 */
export const createAppointment = async (userId: string, appointmentData: Omit<Appointment, keyof AppwriteDocument | 'userId' | 'isCompleted'>): Promise<Appointment> => {
     if (!userId) throw new Error("User ID is required to create an appointment.");
     if (!appointmentsCollectionId) throw new Error("Appointments Collection ID is not configured.");

    try {
        return await databases.createDocument<Appointment>(
            blogDatabaseId,
            appointmentsCollectionId,
            ID.unique(),
            {
                userId: userId,
                isCompleted: false,
                ...appointmentData
            }
            // Add permissions if needed
        );
    } catch (error) {
        console.error("Error creating appointment:", error);
        throw error;
    }
};

/**
 * Fetches appointments for a specific user.
 */
export const getUserAppointments = async (userId: string): Promise<Appointment[]> => {
  console.log(`getUserAppointments: Called for userId: ${userId}`); // <-- Add
  if (!userId) {
      console.log("getUserAppointments: No userId provided."); // <-- Add
      return [];
  }
  if (!appointmentsCollectionId) {
      console.error("getUserAppointments Error: Appointments Collection ID is not configured!"); // <-- Add
      throw new Error("Appointments Collection ID is not configured.");
  }
  console.log(`getUserAppointments: Using DB ID: ${blogDatabaseId}, Collection ID: ${appointmentsCollectionId}`); // <-- Add

 try {
     const response = await databases.listDocuments<Appointment>(
         blogDatabaseId,
         appointmentsCollectionId,
         [
             Query.equal('userId', userId),
             Query.orderAsc('date') // Or orderDesc if you prefer
         ]
     );
     console.log(`getUserAppointments: Received ${response.documents.length} documents for user ${userId}`, response.documents); // <-- Add detailed log
     return response.documents;
 } catch (error) {
     console.error(`getUserAppointments: Error fetching appointments for user ${userId}:`, error); // <-- Add specific error log
     // Re-throw the error so the calling function's catch block can handle it
     throw error;
 }
};

/**
 * Updates an existing appointment record.
 */
export const updateAppointment = async (appointmentDocumentId: string, appointmentData: Partial<Omit<Appointment, keyof AppwriteDocument | 'userId'>>): Promise<Appointment> => {
     if (!appointmentsCollectionId) throw new Error("Appointments Collection ID is not configured.");
    try {
        return await databases.updateDocument<Appointment>(
            blogDatabaseId,
            appointmentsCollectionId,
            appointmentDocumentId,
            appointmentData
        );
    } catch (error) {
        console.error("Error updating appointment:", error);
        throw error;
    }
};

/**
 * Deletes an appointment record.
 */
export const deleteAppointment = async (appointmentDocumentId: string): Promise<void> => {
     if (!appointmentsCollectionId) throw new Error("Appointments Collection ID is not configured.");
    try {
        await databases.deleteDocument(
            blogDatabaseId,
            appointmentsCollectionId,
            appointmentDocumentId
        );
    } catch (error) {
        console.error("Error deleting appointment:", error);
        throw error;
    }
};