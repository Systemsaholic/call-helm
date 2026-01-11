'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle, Building, Users, Phone, Mail } from 'lucide-react'
import { toast } from 'sonner'

interface EnterpriseContactDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function EnterpriseContactDialog({ isOpen, onClose }: EnterpriseContactDialogProps) {
  const [formData, setFormData] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    employees: '',
    currentSolution: '',
    requirements: '',
  })
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // In a real app, this would send the data to your backend
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      setSubmitted(true)
      toast.success('Enterprise inquiry submitted successfully!')
      
      // Reset form after a delay
      setTimeout(() => {
        setSubmitted(false)
        setFormData({
          companyName: '',
          contactName: '',
          email: '',
          phone: '',
          employees: '',
          currentSolution: '',
          requirements: '',
        })
        onClose()
      }, 3000)
    } catch (error) {
      toast.error('Failed to submit inquiry. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        {submitted ? (
          <div className="py-12 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-2xl font-semibold mb-2">Thank You!</h3>
            <p className="text-gray-600 mb-4">
              We've received your Enterprise inquiry. Our team will contact you within 24 hours.
            </p>
            <p className="text-sm text-gray-500">
              You'll receive a confirmation email shortly at {formData.email}
            </p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Enterprise Plan Inquiry</DialogTitle>
              <DialogDescription>
                Tell us about your organization's needs and we'll create a custom Enterprise solution for you.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="companyName">
                    <Building className="h-4 w-4 inline mr-1" />
                    Company Name *
                  </Label>
                  <Input
                    id="companyName"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    required
                    placeholder="Acme Corporation"
                  />
                </div>
                <div>
                  <Label htmlFor="contactName">
                    <Users className="h-4 w-4 inline mr-1" />
                    Contact Name *
                  </Label>
                  <Input
                    id="contactName"
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    required
                    placeholder="John Smith"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="email">
                    <Mail className="h-4 w-4 inline mr-1" />
                    Business Email *
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    placeholder="john@company.com"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">
                    <Phone className="h-4 w-4 inline mr-1" />
                    Phone Number
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="employees">Number of Employees/Agents *</Label>
                <select
                  id="employees"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  value={formData.employees}
                  onChange={(e) => setFormData({ ...formData, employees: e.target.value })}
                  required
                >
                  <option value="">Select range</option>
                  <option value="50-100">50-100</option>
                  <option value="100-250">100-250</option>
                  <option value="250-500">250-500</option>
                  <option value="500-1000">500-1000</option>
                  <option value="1000+">1000+</option>
                </select>
              </div>

              <div>
                <Label htmlFor="currentSolution">Current Call Center Solution (if any)</Label>
                <Input
                  id="currentSolution"
                  value={formData.currentSolution}
                  onChange={(e) => setFormData({ ...formData, currentSolution: e.target.value })}
                  placeholder="e.g., Five9, Genesys, In-house system"
                />
              </div>

              <div>
                <Label htmlFor="requirements">Specific Requirements or Questions *</Label>
                <Textarea
                  id="requirements"
                  value={formData.requirements}
                  onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
                  required
                  placeholder="Tell us about your call volume, number of phone lines needed, integration requirements, etc."
                  rows={4}
                />
              </div>

              <Alert>
                <AlertDescription>
                  <strong>What's included in Enterprise:</strong>
                  <ul className="mt-2 space-y-1 text-sm">
                    <li>• 100+ phone numbers with fair use policy</li>
                    <li>• Unlimited agents, contacts, and call minutes</li>
                    <li>• Unlimited AI transcription and analysis</li>
                    <li>• White label options</li>
                    <li>• Dedicated account manager</li>
                    <li>• Custom integrations and SLA</li>
                    <li>• Priority 24/7 support</li>
                  </ul>
                </AlertDescription>
              </Alert>

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Submitting...' : 'Submit Inquiry'}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}