import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { useAuthStore } from '@/store/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast'; // Assuming you have this hook setup
import {
    getUserProfile,
    updateUserProfile,
    createUserProfile,
    uploadProfilePhoto,
    getFilePreview,
    profileBucketId, // Import the bucket ID
    UserProfile // Import the type
} from '@/lib/appwrite'; // Adjust path if needed
import { User as AuthUserIcon, UploadCloud, Save, Loader2 } from 'lucide-react'; // Renamed User icon import
import { AppwriteDocument } from '@/lib/appwrite';
const ProfilePage = () => {
    // State for profile data and loading/saving status
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // State for photo upload
    const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
    const [localPhotoPreview, setLocalPhotoPreview] = useState<string | null>(null); // Preview for selected file
    const [fetchedPhotoUrl, setFetchedPhotoUrl] = useState<string | null>(null); // URL from fetched profile

    // Auth state and utilities
    const { user } = useAuthStore();
    const { toast } = useToast();

    // Form state - initialize with empty strings or defaults
    const [name, setName] = useState('');
    const [age, setAge] = useState('');
    const [gender, setGender] = useState('');
    const [address, setAddress] = useState('');
    const [monthOfConception, setMonthOfConception] = useState(''); // Match attribute name
    const [preExistingConditions, setPreExistingConditions] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');

    // --- Fetch Profile Data ---
    const fetchProfile = useCallback(async () => {
        if (!user?.$id) {
            setIsLoading(false);
            return; // No user logged in
        }

        setIsLoading(true);
        setFetchedPhotoUrl(null); // Reset photo URL on fetch
        try {
            const profileData = await getUserProfile(user.$id);
            setProfile(profileData); // Store the raw profile data

            if (profileData) {
                // Populate form fields
                setName(profileData.name || user.name || ''); // Fallback to auth name
                setAge(profileData.age?.toString() || '');
                setGender(profileData.gender || '');
                setAddress(profileData.address || '');
                setMonthOfConception(profileData.monthOfConception || ''); // Match attribute name
                setPreExistingConditions(profileData.preExistingConditions || '');
                setPhoneNumber(profileData.phoneNumber || '');

                // Fetch and set the photo preview URL if photo ID exists
                if (profileData.profilePhotoId) {
                    try {
                        // Use the imported profileBucketId
                        const url = getFilePreview(profileData.profilePhotoId, profileBucketId).toString();
                        setFetchedPhotoUrl(url);
                    } catch (e) {
                        console.error("Error getting profile photo preview:", e);
                        // Handle cases where preview might fail (e.g., file deleted)
                    }
                }
            } else {
                // No profile exists yet, set default name from auth user
                setName(user.name || '');
                // Reset other fields
                setAge('');
                setGender('');
                setAddress('');
                setMonthOfConception('');
                setPreExistingConditions('');
                setPhoneNumber('');
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
            toast({
                title: "Failed to load profile",
                description: "Could not retrieve profile data. Please refresh.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    }, [user, toast]); // Dependencies for useCallback

    // Fetch profile when component mounts or user changes
    useEffect(() => {
        fetchProfile();
    }, [fetchProfile]); // Use the memoized fetchProfile function

    // --- Handle Photo Selection ---
    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setProfilePhotoFile(file);

            // Create a local preview URL for the selected file
            const reader = new FileReader();
            reader.onload = (event) => {
                setLocalPhotoPreview(event.target?.result as string);
            };
            reader.readAsDataURL(file);
        } else {
            // Clear selection if no file is chosen
            setProfilePhotoFile(null);
            setLocalPhotoPreview(null);
        }
    };

    // --- Handle Photo Upload ---
    const handleUploadPhoto = async () => {
        if (!profilePhotoFile || !user) return;

        setIsUploading(true);
        try {
            const uploadedFile = await uploadProfilePhoto(profilePhotoFile);

            // Data to update/create profile document
            const profileUpdateData = {
                profilePhotoId: uploadedFile.$id // Store the new file ID
            };

            // Update or create the profile document in the database
            if (profile?.$id) {
                // Profile exists, update it
                await updateUserProfile(profile.$id, profileUpdateData);
            } else {
                // Profile doesn't exist, create it
                // Include essential data like name if creating
                await createUserProfile(user.$id, {
                    ...profileUpdateData,
                    name: name || user.name, // Use current form name or auth name
                    email: user.email // Include email if needed in profile collection
                });
            }

            toast({
                title: "Photo uploaded successfully",
                description: "Your profile photo has been updated.",
            });

            // Clear the file input and local preview
            setProfilePhotoFile(null);
            setLocalPhotoPreview(null);
            const fileInput = document.getElementById('photo-upload') as HTMLInputElement;
            if (fileInput) fileInput.value = '';

            // Refresh the entire profile to show the new photo from storage
            await fetchProfile();

        } catch (error: any) {
            console.error('Error uploading photo:', error);
            toast({
                title: "Upload failed",
                description: error.message || "Could not upload the photo. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsUploading(false);
        }
    };

    // --- Handle Profile Save ---
    const handleSaveProfile = async () => {
        if (!user) return;

        setIsSaving(true);
        try {
            // Consolidate data from form state
            const profileDataToSave: Partial<Omit<UserProfile, keyof AppwriteDocument | 'userId' | 'profilePhotoUrl' | 'email'>> = {
                name: name || user.name, // Ensure name is saved
                age: age ? parseInt(age, 10) : undefined, // Parse age safely
                gender: gender || undefined,
                address: address || undefined,
                monthOfConception: monthOfConception || undefined, // Match attribute name
                preExistingConditions: preExistingConditions || undefined,
                phoneNumber: phoneNumber || undefined,
                // profilePhotoId is handled by handleUploadPhoto
            };

            let updatedProfile: UserProfile | null = null;
            if (profile?.$id) {
                // Update existing profile
                updatedProfile = await updateUserProfile(profile.$id, profileDataToSave);
            } else {
                // Create new profile, include email if your collection requires it
                updatedProfile = await createUserProfile(user.$id, {
                    ...profileDataToSave,
                    email: user.email // Add email if it's an attribute in your 'profiles' collection
                });
            }

            setProfile(updatedProfile); // Update local profile state

            // Update photo URL if it exists in the updated profile
             if (updatedProfile?.profilePhotoId) {
                 try {
                    const url = getFilePreview(updatedProfile.profilePhotoId, profileBucketId).toString();
                    setFetchedPhotoUrl(url);
                 } catch(e) { console.error("Error getting preview after save:", e); }
             } else {
                 setFetchedPhotoUrl(null);
             }


            toast({
                title: "Profile saved successfully",
                description: "Your information has been updated.",
            });

        } catch (error: any) {
            console.error('Error saving profile:', error);
            toast({
                title: "Save failed",
                description: error.message || "Could not save profile changes. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    // Helper for Avatar Fallback
    const getInitials = (nameStr: string | undefined | null): string => {
        if (!nameStr) return 'U'; // Default to 'U' for User
        return nameStr
            .split(' ')
            .map(n => n[0])
            .filter(Boolean) // Remove empty strings if multiple spaces exist
            .join('')
            .toUpperCase()
            .substring(0, 2);
    };

    // Generate month options (Consider moving to a utils file if used elsewhere)
    const generateMonthOptions = () => {
        const months = [];
        const today = new Date();
        for (let i = 10; i >= 0; i--) {
            const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            const value = date.toISOString().slice(0, 7); // YYYY-MM format
            months.push({ label: monthYear, value });
        }
        return months;
    };
    const monthOptions = generateMonthOptions(); // Generate once

    // --- Render Logic ---
    return (
        <MainLayout requireAuth={true}>
            <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-momcare-primary">My Profile</h1>
                    <p className="text-gray-600 mt-2">
                        Manage your personal information and pregnancy details
                    </p>
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-12">
                        <Loader2 className="h-10 w-10 text-momcare-primary animate-spin mb-4" />
                        <p className="text-gray-600">Loading your profile...</p>
                    </div>
                ) : !user ? (
                     <div className="text-center py-12">
                        <p className="text-red-600">You need to be logged in to view your profile.</p>
                        {/* Optionally add a login button/link here */}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* --- Profile Photo Section --- */}
                        <div className="md:col-span-1">
                            <Card className="border-momcare-primary/20">
                                <CardHeader className="bg-momcare-light">
                                    <CardTitle className="flex items-center text-momcare-primary">
                                        <AuthUserIcon className="mr-2 h-5 w-5" />
                                        Profile Photo
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-6 flex flex-col items-center">
                                    <Avatar className="h-32 w-32 mb-4 border-2 border-momcare-light">
                                        {/* Prioritize local preview, then fetched URL */}
                                        <AvatarImage src={localPhotoPreview || fetchedPhotoUrl || undefined} alt={name || 'User profile photo'} />
                                        <AvatarFallback className="bg-momcare-primary text-white text-3xl">
                                            {getInitials(name || user?.name)}
                                        </AvatarFallback>
                                    </Avatar>

                                    <div className="space-y-4 w-full">
                                        <div className="space-y-2">
                                            <Label htmlFor="photo-upload">Upload New Photo</Label>
                                            <Input
                                                id="photo-upload"
                                                type="file"
                                                accept="image/png, image/jpeg, image/gif, image/webp" // Be specific
                                                onChange={handlePhotoChange}
                                                className="cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-momcare-light file:text-momcare-primary hover:file:bg-momcare-primary/10"
                                                disabled={isUploading}
                                            />
                                        </div>

                                        {profilePhotoFile && (
                                            <Button
                                                onClick={handleUploadPhoto}
                                                className="w-full bg-momcare-primary hover:bg-momcare-dark"
                                                disabled={isUploading}
                                            >
                                                {isUploading ? (
                                                    <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading... </>
                                                ) : (
                                                    <> <UploadCloud className="mr-2 h-4 w-4" /> Upload Photo </>
                                                )}
                                            </Button>
                                        )}

                                        <div className="pt-4 border-t mt-4">
                                            <p className="text-sm font-medium text-gray-800">Account Info</p>
                                            <div className="mt-2 space-y-1 text-sm">
                                                <p><span className="text-gray-500 w-20 inline-block">Email:</span> <span className="font-medium break-all">{user?.email}</span></p>
                                                <p><span className="text-gray-500 w-20 inline-block">User ID:</span> <span className="font-medium break-all">{user?.$id}</span></p>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* --- Personal Information Section --- */}
                        <div className="md:col-span-2">
                            <Card className="border-momcare-primary/20">
                                <CardHeader className="bg-momcare-light">
                                    <CardTitle className="flex items-center text-momcare-primary">
                                        <AuthUserIcon className="mr-2 h-5 w-5" />
                                        Personal Information
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-6">
                                    <form onSubmit={(e) => { e.preventDefault(); handleSaveProfile(); }} className="space-y-6">
                                        {/* Personal Details Grid */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="name">Full Name</Label>
                                                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your full name" required />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="age">Age</Label>
                                                <Input id="age" type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g., 30" min="15" max="99" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="gender">Gender</Label>
                                                <Select value={gender} onValueChange={setGender}>
                                                    <SelectTrigger id="gender"><SelectValue placeholder="Select gender" /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="female">Female</SelectItem>
                                                        <SelectItem value="male">Male</SelectItem>
                                                        <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                                                        <SelectItem value="other">Other</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="phone">Phone Number</Label>
                                                <Input id="phone" type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="Optional phone number" />
                                            </div>
                                        </div>

                                        {/* Address */}
                                        <div className="space-y-1.5">
                                            <Label htmlFor="address">Address</Label>
                                            <Textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional address" className="min-h-[80px]" />
                                        </div>

                                        {/* Pregnancy Info Section */}
                                        <div className="pt-4 border-t">
                                            <p className="text-lg font-medium text-momcare-primary mb-4">Pregnancy Information</p>
                                            <div className="space-y-4">
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="conception-month">Approximate Month of Conception</Label>
                                                    <Select value={monthOfConception} onValueChange={setMonthOfConception}>
                                                        <SelectTrigger id="conception-month"><SelectValue placeholder="Select month" /></SelectTrigger>
                                                        <SelectContent>
                                                            {monthOptions.map((month) => (
                                                                <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="conditions">Pre-existing Medical Conditions (if any)</Label>
                                                    <Textarea id="conditions" value={preExistingConditions} onChange={(e) => setPreExistingConditions(e.target.value)} placeholder="e.g., Diabetes, Hypertension, Thyroid disorders" className="min-h-[100px]" />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Save Button */}
                                        <div className="pt-4 flex justify-end">
                                            <Button type="submit" className="bg-momcare-primary hover:bg-momcare-dark" disabled={isSaving}>
                                                {isSaving ? (
                                                    <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving... </>
                                                ) : (
                                                    <> <Save className="mr-2 h-4 w-4" /> Save Profile </>
                                                )}
                                            </Button>
                                        </div>
                                    </form>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                )}
            </div>
        </MainLayout>
    );
};

export default ProfilePage;