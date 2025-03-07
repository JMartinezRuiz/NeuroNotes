from datetime import datetime
from app import db


class Group(db.Model):
    """Modelo para los grupos"""
    __tablename__ = 'groups'

    id = db.Column(db.Integer, primary_key=True)
    groupname = db.Column(db.String(64), nullable=False)
    owner_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relaciones
    notes = db.relationship('Note', backref='group', lazy='dynamic')
    categories = db.relationship('Category',
                                 backref='group',
                                 lazy='dynamic',
                                 primaryjoin="and_(Category.group_id==Group.id, Category.type=='group')")

    def __repr__(self):
        return f'<Group {self.groupname}>'

    def to_dict(self):
        """Convierte el objeto a un diccionario"""
        return {
            'id': self.id,
            'groupname': self.groupname,
            'owner_id': self.owner_id,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }


class GroupMember(db.Model):
    """Modelo para miembros de un grupo"""
    __tablename__ = 'group_members'

    group_id = db.Column(db.Integer, db.ForeignKey('groups.id', ondelete='CASCADE'), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    role = db.Column(db.String(20), default='member', nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relación directa con usuario y grupo
    user = db.relationship('User', backref=db.backref('memberships', lazy='dynamic'))
    group = db.relationship('Group', backref=db.backref('memberships', lazy='dynamic'))

    def __repr__(self):
        return f'<GroupMember {self.user_id} in {self.group_id} as {self.role}>'

    def to_dict(self):
        """Convierte el objeto a un diccionario"""
        return {
            'group_id': self.group_id,
            'user_id': self.user_id,
            'role': self.role,
            'created_at': self.created_at.isoformat()
        }