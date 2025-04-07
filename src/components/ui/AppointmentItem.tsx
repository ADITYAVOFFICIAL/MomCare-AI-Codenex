// src/components/AppointmentItem.tsx
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Appointment } from '@/lib/appwrite'; // Assuming Appointment type is exported
import { format } from 'date-fns';
import { Calendar, Clock, Edit, Trash2 } from 'lucide-react';

interface AppointmentItemProps {
  appointment: Appointment;
  onEdit: (appointment: Appointment) => void;
  onDelete: (appointmentId: string) => void;
  isDeleting?: boolean; // Optional: To show loading state on delete button
}

const AppointmentItem: React.FC<AppointmentItemProps> = ({
  appointment,
  onEdit,
  onDelete,
  isDeleting = false,
}) => {
  const formattedDate = format(new Date(appointment.date), 'PPP'); // e.g., Jun 9, 2024

  return (
    <Card className="mb-4 border-momcare-primary/10 hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div className="flex-grow mb-3 sm:mb-0">
          <div className="flex items-center text-momcare-primary font-semibold mb-1">
            <Calendar className="h-4 w-4 mr-2" />
            <span>{formattedDate}</span>
          </div>
          <div className="flex items-center text-gray-600 mb-2">
            <Clock className="h-4 w-4 mr-2" />
            <span>{appointment.time}</span>
          </div>
          {appointment.notes && (
            <p className="text-sm text-gray-500 bg-gray-50 p-2 rounded">
              <span className="font-medium">Notes:</span> {appointment.notes}
            </p>
          )}
        </div>
        <div className="flex space-x-2 flex-shrink-0 self-end sm:self-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(appointment)}
            aria-label="Edit appointment"
            className="text-blue-600 border-blue-200 hover:bg-blue-50"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(appointment.$id)}
            disabled={isDeleting}
            aria-label="Delete appointment"
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Add Loader2 to the import if not already there
import { Loader2 } from 'lucide-react';

export default AppointmentItem;