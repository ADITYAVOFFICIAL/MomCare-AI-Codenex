// src/pages/AppointmentPage.tsx

import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { useAuthStore } from '@/store/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Calendar as CalendarIcon,
  Clock,
  Loader2,
  ListChecks,
  Edit,
  Trash2,
  Info, // Added for guidelines icon
  Inbox, // Added for empty state icon
  AlertTriangle
} from 'lucide-react';
import { format, isAfter } from 'date-fns'; // Removed parseISO
import { Calendar } from '@/components/ui/calendar';
import {
  createAppointment,
  getUserAppointments,
  deleteAppointment,
  Appointment,
  updateAppointment, // Import update function for the modal
} from '@/lib/appwrite';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
// Correct the import paths if your components are directly under /components
import AppointmentItem from '@/components/ui/AppointmentItem'; // Assuming it's here now
import EditAppointmentModal from '@/components/ui/EditAppointmentModal'; // Assuming it's here now
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const AppointmentPage = () => {
  // Booking form state
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [isBookingLoading, setIsBookingLoading] = useState(false);

  // Appointment list state
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(true); // Start loading initially
  const [errorAppointments, setErrorAppointments] = useState<string | null>(null);

  // Edit/Delete state
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [deletingAppointmentId, setDeletingAppointmentId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [appointmentToDelete, setAppointmentToDelete] = useState<string | null>(null);

  const { user, isAuthenticated } = useAuthStore();
  const { toast } = useToast();

  // Available time slots - keep consistent
  const timeSlots = [
    '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
    '12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM',
    '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM'
  ];

  // --- Function to fetch appointments ---
  const fetchAppointments = useCallback(async () => {
    console.log('AppointmentPage: fetchAppointments called. User:', user);
    if (!user || !user.$id) {
      console.log('AppointmentPage: No user or user ID, skipping fetch.');
      setIsLoadingAppointments(false);
      setUpcomingAppointments([]); // Clear appointments if no user
      return;
    }

    setIsLoadingAppointments(true);
    setErrorAppointments(null);
    console.log('AppointmentPage: Fetching appointments for user ID:', user.$id);

    try {
      const allAppointments = await getUserAppointments(user.$id);
      console.log('AppointmentPage: Raw appointmentsData:', allAppointments);
      const now = new Date();
      console.log('AppointmentPage: Current time (now):', now.toISOString());

      // *** CORRECTED Filtering and Sorting Logic ***
      const upcoming = allAppointments
        .filter(app => {
           try {
             const appDateTime = new Date(app.date); // Parse ISO string date
             if (isNaN(appDateTime.getTime())) {
                console.error('AppointmentPage Filter Error: Invalid base date format:', app.date, 'for app:', app.$id);
                return false;
             }
             const timeParts = app.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
             if (!timeParts) {
                 console.error('AppointmentPage Filter Error: Invalid time format:', app.time, 'for app:', app.$id);
                 return false;
             }
             let hours = parseInt(timeParts[1], 10);
             const minutes = parseInt(timeParts[2], 10);
             const period = timeParts[3].toUpperCase();
             if (period === 'PM' && hours !== 12) hours += 12;
             else if (period === 'AM' && hours === 12) hours = 0;
             appDateTime.setHours(hours, minutes, 0, 0);

             // console.log(`AppointmentPage Filter: App ${app.$id} - Comparing ${appDateTime.toISOString()} with ${now.toISOString()}`);
             const isUpcoming = isAfter(appDateTime, now);
             // console.log(`AppointmentPage Filter: App ${app.$id} - isAfter: ${isUpcoming}, isCompleted: ${app.isCompleted}`);
             return isUpcoming && !app.isCompleted;
           } catch (err) {
             console.error('AppointmentPage Filter Error: Unexpected error processing app:', JSON.stringify(app), err);
             return false;
           }
        })
        .sort((a, b) => {
           try {
             const dateTimeA = new Date(a.date);
             const timePartsA = a.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
             if (!timePartsA || isNaN(dateTimeA.getTime())) return 0;
             let hoursA = parseInt(timePartsA[1], 10); const minutesA = parseInt(timePartsA[2], 10); const periodA = timePartsA[3].toUpperCase();
             if (periodA === 'PM' && hoursA !== 12) hoursA += 12; else if (periodA === 'AM' && hoursA === 12) hoursA = 0;
             dateTimeA.setHours(hoursA, minutesA, 0, 0);

             const dateTimeB = new Date(b.date);
             const timePartsB = b.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
             if (!timePartsB || isNaN(dateTimeB.getTime())) return 0;
             let hoursB = parseInt(timePartsB[1], 10); const minutesB = parseInt(timePartsB[2], 10); const periodB = timePartsB[3].toUpperCase();
             if (periodB === 'PM' && hoursB !== 12) hoursB += 12; else if (periodB === 'AM' && hoursB === 12) hoursB = 0;
             dateTimeB.setHours(hoursB, minutesB, 0, 0);

             if (isNaN(dateTimeA.getTime()) || isNaN(dateTimeB.getTime())) return 0;
             return dateTimeA.getTime() - dateTimeB.getTime();
           } catch (err) {
             console.error('AppointmentPage Sort Error: Unexpected error processing apps:', JSON.stringify(a), JSON.stringify(b), err);
             return 0;
           }
        });

      console.log('AppointmentPage: Filtered and sorted upcoming appointments:', upcoming);
      setUpcomingAppointments(upcoming);
    } catch (error) {
      console.error('AppointmentPage: Error fetching appointments:', error);
      setErrorAppointments('Failed to load appointments. Please try refreshing the page.');
      setUpcomingAppointments([]); // Clear on error
      toast({
        title: "Loading Error",
        description: "Could not fetch your appointments.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingAppointments(false);
      console.log('AppointmentPage: fetchAppointments finished.');
    }
  }, [user, toast]); // Dependencies

  // Fetch appointments when component mounts or user changes
  useEffect(() => {
    if (user) {
        fetchAppointments();
    } else {
        // Handle logged out state
        setIsLoadingAppointments(false);
        setUpcomingAppointments([]);
    }
  }, [user, fetchAppointments]); // Rerun when user or fetchAppointments changes

  // --- Booking Handler ---
  const handleBookAppointment = async () => {
    if (!isAuthenticated || !user) {
      toast({ title: "Login Required", description: "Please log in to book.", variant: "destructive" });
      return;
    }
    if (!date || !time) {
      toast({ title: "Missing Info", description: "Please select date and time.", variant: "destructive" });
      return;
    }

    setIsBookingLoading(true);
    try {
      // Format date as YYYY-MM-DD for Appwrite, time is stored as string
      const formattedDate = format(date, 'yyyy-MM-dd');
      await createAppointment(user.$id, { date: formattedDate, time, notes });

      toast({
        title: "Appointment Booked!",
        description: `Scheduled for ${format(date, 'MMMM d, yyyy')} at ${time}.`,
      });
      // Reset form
      setDate(undefined);
      setTime(undefined);
      setNotes('');
      fetchAppointments(); // Refresh the list immediately
    } catch (error) {
      console.error('Error booking appointment:', error);
      toast({ title: "Booking Failed", description: "Could not book appointment. Please try again.", variant: "destructive" });
    } finally {
      setIsBookingLoading(false);
    }
  };

  // --- Edit and Delete Handlers ---
  const handleEdit = (appointment: Appointment) => {
    setEditingAppointment(appointment);
    setIsEditModalOpen(true);
  };

  const handleDeleteClick = (appointmentId: string) => {
    setAppointmentToDelete(appointmentId);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!appointmentToDelete) return;
    setDeletingAppointmentId(appointmentToDelete);
    setIsDeleteDialogOpen(false);
    try {
      await deleteAppointment(appointmentToDelete);
      toast({ title: "Appointment Deleted", description: "Successfully removed." });
      fetchAppointments(); // Re-fetch to update list
    } catch (error) {
      console.error('Error deleting appointment:', error);
      toast({ title: "Deletion Failed", description: "Could not delete appointment.", variant: "destructive" });
    } finally {
      setDeletingAppointmentId(null);
      setAppointmentToDelete(null);
    }
  };

  // --- JSX Rendering ---
  return (
    <MainLayout requireAuth={true}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-momcare-primary sm:text-4xl">
            Schedule & Manage Appointments
          </h1>
          <p className="mt-3 text-lg text-gray-600">
            Book a new check-up or view and manage your existing appointments below.
          </p>
        </div>

        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

          {/* Column 1: Booking Form Card */}
          <div className="lg:col-span-1 space-y-6">
             <Card className="shadow-md border border-momcare-primary/10 rounded-lg overflow-hidden">
               <CardHeader className="bg-gradient-to-r from-momcare-light to-white p-5 border-b border-momcare-primary/10">
                 <CardTitle className="flex items-center text-xl font-semibold text-momcare-primary">
                   <CalendarIcon className="mr-2.5 h-5 w-5" />
                   Book New Appointment
                 </CardTitle>
               </CardHeader>
               <CardContent className="p-6 space-y-5">
                 {/* Date Picker */}
                 <div className="space-y-1.5">
                   <Label htmlFor="date-popover-button" className="text-sm font-medium text-gray-700">Select Date *</Label>
                   <Popover>
                     <PopoverTrigger asChild>
                       <Button
                         id="date-popover-button"
                         variant="outline"
                         className={`w-full justify-start text-left font-normal ${!date && "text-muted-foreground"}`}
                       >
                         <CalendarIcon className="mr-2 h-4 w-4" />
                         {date ? format(date, 'PPP') : <span>Pick a date</span>}
                       </Button>
                     </PopoverTrigger>
                     <PopoverContent className="w-auto p-0" align="start">
                       <Calendar
                         mode="single"
                         selected={date}
                         onSelect={setDate}
                         disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))} // Disable past dates only
                         initialFocus
                       />
                     </PopoverContent>
                   </Popover>
                 </div>
                 {/* Time Selector */}
                 <div className="space-y-1.5">
                   <Label htmlFor="time-select" className="text-sm font-medium text-gray-700">Select Time *</Label>
                   <Select value={time} onValueChange={setTime}>
                     <SelectTrigger id="time-select" className="w-full">
                       <SelectValue placeholder="Select a time slot" />
                     </SelectTrigger>
                     <SelectContent>
                       {timeSlots.map((slot) => (
                         <SelectItem key={slot} value={slot}>
                           <div className="flex items-center text-sm">
                             <Clock className="mr-2 h-4 w-4 opacity-70" /> {slot}
                           </div>
                         </SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 </div>
                 {/* Notes */}
                 <div className="space-y-1.5">
                   <Label htmlFor="notes" className="text-sm font-medium text-gray-700">Notes (Optional)</Label>
                   <Textarea
                     id="notes"
                     placeholder="Any specific concerns or requests..."
                     value={notes}
                     onChange={(e) => setNotes(e.target.value)}
                     className="min-h-[100px] text-sm"
                   />
                 </div>
                 {/* Booking Button */}
                 <Button
                   onClick={handleBookAppointment}
                   size="lg" // Make button slightly larger
                   className="w-full py-3 text-base bg-momcare-primary hover:bg-momcare-dark transition-colors duration-200"
                   disabled={!date || !time || isBookingLoading}
                 >
                   {isBookingLoading ? (
                     <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Booking...</>
                   ) : (
                     "Confirm Booking"
                   )}
                 </Button>
               </CardContent>
             </Card>

             {/* Appointment Guidelines Card */}
             <Card className="shadow-sm border border-gray-200 rounded-lg bg-gray-50/70">
                <CardHeader className="p-4 border-b border-gray-200">
                    <CardTitle className="flex items-center text-base font-medium text-gray-700">
                        <Info className="mr-2 h-4 w-4 text-blue-500" />
                        Appointment Guidelines
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                    <ul className="space-y-1.5 text-xs text-gray-600 list-disc list-outside pl-4">
                        <li>Please arrive 15 minutes before your scheduled time.</li>
                        <li>Bring recent test results or medical records if applicable.</li>
                        <li>Cancellations/reschedules require 24 hours notice.</li>
                        <li>Check your email for booking confirmation.</li>
                    </ul>
                </CardContent>
             </Card>
          </div>

          {/* Column 2: Upcoming Appointments List Card */}
          <div className="lg:col-span-2">
            <Card className="shadow-md border border-momcare-primary/10 rounded-lg overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-momcare-light to-white p-5 border-b border-momcare-primary/10">
                <CardTitle className="flex items-center text-xl font-semibold text-momcare-primary">
                  <ListChecks className="mr-2.5 h-5 w-5" />
                  Your Upcoming Appointments
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 md:p-6 min-h-[200px]"> {/* Add min-height */}
                {/* Loading State */}
                {isLoadingAppointments && (
                  <div className="flex flex-col justify-center items-center text-center h-full py-10">
                    <Loader2 className="h-10 w-10 animate-spin text-momcare-primary mb-3" />
                    <p className="text-gray-500 font-medium">Loading your appointments...</p>
                  </div>
                )}

                {/* Error State */}
                {!isLoadingAppointments && errorAppointments && (
                  <div className="flex flex-col justify-center items-center text-center h-full py-10 bg-red-50 p-6 rounded-md border border-red-200">
                     <AlertTriangle className="h-10 w-10 text-red-500 mb-3" />
                     <p className="text-red-700 font-semibold mb-1">Oops! Something went wrong.</p>
                     <p className="text-red-600 text-sm">{errorAppointments}</p>
                  </div>
                )}

                {/* Empty State */}
                {!isLoadingAppointments && !errorAppointments && upcomingAppointments.length === 0 && (
                  <div className="flex flex-col justify-center items-center text-center h-full py-10">
                     <Inbox className="h-12 w-12 text-gray-400 mb-3" />
                     <p className="text-gray-500 font-medium">No upcoming appointments found.</p>
                     <p className="text-gray-400 text-sm mt-1">Use the form to schedule your next visit.</p>
                  </div>
                )}

                {/* Appointments List */}
                {!isLoadingAppointments && !errorAppointments && upcomingAppointments.length > 0 && (
                  <div className="space-y-3"> {/* Add space between items */}
                    {upcomingAppointments.map((app) => (
                      <AppointmentItem
                        key={app.$id}
                        appointment={app}
                        onEdit={handleEdit}
                        onDelete={handleDeleteClick}
                        isDeleting={deletingAppointmentId === app.$id}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div> {/* End Grid */}
      </div> {/* End Container */}

      {/* --- Modals and Dialogs --- */}
      <EditAppointmentModal
        appointment={editingAppointment}
        isOpen={isEditModalOpen}
        onClose={() => { setIsEditModalOpen(false); setEditingAppointment(null); }}
        onAppointmentUpdated={fetchAppointments} // Refresh list after update
      />
       <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
             <AlertDialogDescription>
               Are you sure you want to delete this appointment? This action cannot be undone.
             </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel onClick={() => setAppointmentToDelete(null)}>Cancel</AlertDialogCancel>
             <AlertDialogAction
               onClick={confirmDelete}
               className="bg-red-600 hover:bg-red-700"
               disabled={deletingAppointmentId === appointmentToDelete}
             >
               {deletingAppointmentId === appointmentToDelete ? (
                 <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...</>
               ) : (
                 "Delete Appointment"
               )}
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>

    </MainLayout>
  );
};

export default AppointmentPage;